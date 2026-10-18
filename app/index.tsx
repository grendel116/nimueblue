import { memo, useState, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  BackHandler,
  View,
  Text,
  FlatList,
  ScrollView,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryTrackGroups } from "@/queries/queries";
import {
  distributeFairChorusAlbums,
  queryFederatedChorusAlbums,
} from "@/queries/chorus";
import {
  fairplayerReleaseSlug,
  queryFairplayerAlbums,
} from "@/queries/fairplayer";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";
import { getHistory, getHistorySync, subscribeHistory, HistoryItem } from "@/scripts/historyManager";
import {
  openMainTab,
  setMainTab,
  useMainTab,
} from "@/components/Footer";
import { openDownloadedAlbum } from "@/scripts/albumLookup";
import QueueScreen from "@/app/feed";
import LibraryScreen from "@/app/library";
import {
  RADIO_STATIONS,
  RadioStation,
  deduplicateRadioStations,
  sortRadioRandomly,
  queryRadioPlays,
  queryDiscoveredRadioStations,
} from "@/queries/radio";
import {
  PODCAST_SHOWS,
  PodcastShow,
  sortDiscussionsByLastUpdate,
  queryDiscoveredPodcasts,
} from "@/queries/podcast";
import OfflineNotice from "@/components/OfflineNotice";
import { openInBrowser } from "@/scripts/openInBrowser";
import { dragScroll } from "@/scripts/dragScroll";
import { useAppIsReadyContext } from "@/state/AppReadyContext";
import {
  isQualityArtwork,
  resolveArtworkUrl,
  resolveQualityArtworkSource,
} from "@/scripts/utils";

export const CAROUSEL_LIMIT = 12;

// Keys for the empty cards a carousel shows while its releases load
const EMPTY_CARD_KEYS = Array.from({ length: CAROUSEL_LIMIT }, (_, index) => `empty-${index}`);

export function shuffleCarousel<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function blendCarouselReleases(
  direct: AlbumProps[] = [],
  chorus: AlbumProps[] = [],
  fairplayer: AlbumProps[] = [],
  limit: number = CAROUSEL_LIMIT,
): AlbumProps[] {
  const seenIds = new Set<number>();
  const seenSlugs = new Set<string>();
  const artistCounts = new Map<string, number>();

  const shuffledDirect = shuffleCarousel(direct);
  const shuffledChorus = distributeFairChorusAlbums(shuffleCarousel(chorus), 2);
  const shuffledFairplayer = distributeFairChorusAlbums(shuffleCarousel(fairplayer), 2);

  const combinedCandidates = shuffleCarousel([
    ...shuffledDirect,
    ...shuffledChorus,
    ...shuffledFairplayer,
  ]);

  const blended: AlbumProps[] = [];
  for (const item of combinedCandidates) {
    if (!item) continue;
    const artistKey = (item.artist?.name || String(item.artistId || "")).toLowerCase().trim();
    const count = artistCounts.get(artistKey) || 0;
    if (count >= 2) continue;
    if (seenIds.has(item.id) || (item.urlSlug && seenSlugs.has(item.urlSlug))) continue;

    seenIds.add(item.id);
    if (item.urlSlug) seenSlugs.add(item.urlSlug);
    artistCounts.set(artistKey, count + 1);
    blended.push(item);
    if (blended.length >= limit) break;
  }

  return blended;
}

// Home's carousels keep their picks this long before drawing new ones
const CAROUSEL_STALE_TIME = 15 * 60 * 1000;

// Queries behind Home's carousels
const HOME_QUERIES = new Set([
  "fetchTrackGroups",
  "federatedChorusAlbums",
  "fairplayerAlbums",
  "discoveredRadioStations",
  "castopodPodcasts",
  "fetchRadioPlays",
]);

export default function Index() {
  const router = useRouter();
  const { tab } = useMainTab();

  // Android Back returns to Home when on Queue or Library at the root of the stack
  useEffect(() => {
    if (tab === "home") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (router.canDismiss()) return false;
      setMainTab("home");
      return true;
    });
    return () => sub.remove();
  }, [tab, router]);

  return (
    <View style={styles.root}>
      <View style={tab === "home" ? styles.pane : styles.hiddenPane}>
        <HomePane active={tab === "home"} />
      </View>
      {tab === "queue" && <QueueScreen />}
      {tab === "library" && (
        <LibraryScreen />
      )}
    </View>
  );
}

const HomePane = memo(function HomePane({ active }: { active: boolean }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [shuffleSeed, setShuffleSeed] = useState(0);

  // Recent Releases: loads behind the splash screen on startup. Held until the listener
  // pulls down to refresh so the home page never re-queries or re-renders automatically.
  const {
    data: recentData,
    isPending: isRecentPending,
    isError: offline,
    isFetching: isRecentFetching,
    refetch: refetchRecent,
  } = useQuery({
    ...queryTrackGroups({
      take: 12,
      orderBy: "random",
      distinctArtists: true,
      isReleased: "released",
    }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
  });

  // Query releases from the configured Mirlo Chorus catalog
  const {
    data: chorusAlbums,
    refetch: refetchChorus,
  } = useQuery({
    ...queryFederatedChorusAlbums({ take: 40 }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const { data: fairplayerAlbums, refetch: refetchFairplayer } = useQuery({
    ...queryFairplayerAlbums(40),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
  });

  // Query discovered autonomous community and pirate radio stations
  const {
    data: discoveredRadio = [],
    refetch: refetchDiscoveredRadio,
  } = useQuery({
    ...queryDiscoveredRadioStations(8),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Discover podcast feeds through the open Castopod Index catalog
  const {
    data: discoveredPodcasts = [],
    refetch: refetchDiscoveredPodcasts,
  } = useQuery({
    ...queryDiscoveredPodcasts(6),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  // Leaving Home stops its refresh: refreshes in flight are cancelled and Home keeps the
  // releases it already has. First loads carry on, since Home has nothing to show without them
  const queryClient = useQueryClient();
  useEffect(() => {
    if (active) return;
    setIsPullRefreshing(false);
    queryClient.cancelQueries({
      predicate: (query) =>
        HOME_QUERIES.has(String(query.queryKey[0])) && query.state.data !== undefined,
    });
  }, [active, queryClient]);
  const retry = () => {
    setShuffleSeed((s) => s + 1);
    refetchChorus();
    refetchFairplayer();
    refetchDiscoveredRadio();
    refetchDiscoveredPodcasts();
    // The pull spinner waits for Mirlo's picks; the wider catalogs fill in as they arrive
    return Promise.all([refetchRecent()]);
  };
  const pullToRefresh = () => {
    setIsPullRefreshing(true);
    retry().finally(() => setIsPullRefreshing(false));
  };

  // Shuffled blend of Mirlo, Chorus, and Faircamp releases with fair artist representation
  const recentReleases = useMemo(
    () =>
      blendCarouselReleases(
        recentData?.results || [],
        chorusAlbums || [],
        fairplayerAlbums || [],
        CAROUSEL_LIMIT,
      ).slice(0, CAROUSEL_LIMIT),
    [recentData?.results, chorusAlbums, fairplayerAlbums, shuffleSeed],
  );

  // Shuffled curated and discovered radio stations
  const radioStations = useMemo(() => {
    const combined = [...RADIO_STATIONS, ...discoveredRadio].filter((station) =>
      isQualityArtwork(station.artwork),
    );
    return sortRadioRandomly(deduplicateRadioStations(combined)).slice(0, CAROUSEL_LIMIT);
  }, [discoveredRadio, shuffleSeed]);

  // Curated and Castopod-indexed discussion shows, ordered by latest episode
  const podcastShows = useMemo(() => {
    const combined = [...PODCAST_SHOWS, ...discoveredPodcasts].filter((show) =>
      isQualityArtwork(show.artwork),
    );
    return sortDiscussionsByLastUpdate(combined).slice(0, CAROUSEL_LIMIT);
  }, [discoveredPodcasts]);

  // The splash screen stays up until Home has its first content (or an error to show)
  const { setIsDataLoaded } = useAppIsReadyContext();
  useEffect(() => {
    if (!isRecentPending) setIsDataLoaded(true);
  }, [isRecentPending, setIsDataLoaded]);

  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(getHistorySync);

  useEffect(() => {
    let mounted = true;
    getHistory().then((items) => {
      if (mounted) setHistoryItems(items);
    });
    const unsubscribe = subscribeHistory((items) => {
      if (mounted) setHistoryItems(items);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Top 6 items for the "Viewing History" 2-column grid
  const quickAccessItems = historyItems.slice(0, 6);

  const cardWidth = Math.max(140, Math.min(170, (width - 48) / 2.2));

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image
            source={require("@/assets/images/nimue-blue-logo.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <View style={styles.brandWordmark}>
            <Text style={styles.brandText}>NIMUE</Text>
            <Text style={[styles.brandText, styles.brandHighlight]}>BLUE</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() => openInBrowser("https://cash.app/$grendel116/")}
            style={styles.subscribeButton}
            accessibilityRole="button"
            accessibilityLabel="Support NimueBlue"
          >
            <Ionicons name="heart" size={15} color={theme.colors.playButtonIcon} />
            <Text style={styles.subscribeText}>Support</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/search")}
            style={styles.searchButton}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Ionicons name="search" size={22} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isPullRefreshing}
            onRefresh={pullToRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surfaceElevated}
          />
        }
      >
        {offline ? (
          <OfflineNotice retrying={isRecentFetching} onRetry={retry} onOpenLibrary={() => openMainTab("library")} />
        ) : (
          <>
            {/* Viewing History / Quick Access 2-Column Grid */}
            {quickAccessItems.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionHeader}>History</Text>
                </View>
                <View style={styles.historyGrid}>
                  {quickAccessItems.map((item, idx) => {
                    return (
                      <Pressable
                        key={`${item.downloadAlbum ?? item.id}-${idx}`}
                        android_ripple={{ color: theme.colors.ripple }}
                        onPress={() =>
                          item.downloadAlbum
                            ? openDownloadedAlbum(item.downloadAlbum)
                            : router.push({
                                pathname: "/artist/[id]/album/[slug]/album-tracks",
                                params: {
                                  id:
                                    fairplayerReleaseSlug.artistRouteId(
                                      item.urlSlug ?? "",
                                    ) ?? String(item.artistId),
                                  slug: String(item.urlSlug),
                                },
                              })
                        }
                        style={({ pressed }) => [styles.historyCard, pressed && styles.cardPressed]}
                      >
                        <Image
                          source={resolveQualityArtworkSource(item.coverUri)}
                          style={styles.historyThumb}
                        />
                        <View style={styles.historyTextContainer}>
                          <Text style={styles.historyTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.historyArtist} numberOfLines={1}>
                            {item.artistName}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* SECTION 1: RECENT RELEASES (Horizontal Carousel) */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionHeader}>Recent Releases</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
              </View>

              {isRecentPending ? (
                <ScrollView
                  horizontal
                  scrollEnabled={false}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                >
                  {EMPTY_CARD_KEYS.map((key) => (
                    <View key={key} style={[styles.albumCard, { width: cardWidth }]}>
                      <View style={styles.cardImageContainer} />
                      <View style={styles.emptyCardTitle} />
                      <View style={styles.emptyCardArtist} />
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <FlatList
                  ref={dragScroll}
                  horizontal
                  data={recentReleases}
                  keyExtractor={(item, index) => String(item.id ?? index)}
                  initialNumToRender={4}
                  maxToRenderPerBatch={4}
                  windowSize={3}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                  renderItem={({ item }) => {
                    const coverUri =
                      item.cover?.sizes?.[300] ||
                      item.cover?.sizes?.[600] ||
                      item.cover?.sizes?.[120];
                    return (
                      <Pressable
                        android_ripple={{ color: theme.colors.ripple, borderless: false }}
                        onPress={() =>
                          router.push({
                            pathname: "/artist/[id]/album/[slug]/album-tracks",
                            params: {
                              id:
                                fairplayerReleaseSlug.artistRouteId(
                                  String(item.urlSlug || ""),
                                ) ?? String(item.artist?.urlSlug || item.artistId),
                              slug: String(item.urlSlug),
                            },
                          })
                        }
                        style={({ pressed }) => [styles.albumCard, { width: cardWidth }, pressed && styles.cardPressed]}
                      >
                        <View style={styles.cardImageContainer}>
                          <Image
                            source={resolveQualityArtworkSource(coverUri)}
                            style={styles.cardCoverImage}
                            resizeMode="cover"
                          />
                          <View style={styles.glassSheen} />
                        </View>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.cardArtist} numberOfLines={1}>
                          {item.artist?.name}
                        </Text>
                      </Pressable>
                    );
                  }}
                />
              )}
            </View>



            {/* RADIO: one card per station, showing what's on air */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionHeader}>Radio</Text>
              </View>
              <FlatList
                ref={dragScroll}
                horizontal
                data={radioStations}
                keyExtractor={(station) => station.id}
                initialNumToRender={4}
                maxToRenderPerBatch={4}
                windowSize={3}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carouselContent}
                renderItem={({ item }) => (
                  <StationCard station={item} cardWidth={cardWidth} active={active} />
                )}
              />
            </View>

            {/* DISCUSSION: one card per show */}
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionHeader}>Discussion</Text>
              </View>
              <FlatList
                ref={dragScroll}
                horizontal
                data={podcastShows}
                keyExtractor={(show) => show.id}
                initialNumToRender={4}
                maxToRenderPerBatch={4}
                windowSize={3}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carouselContent}
                renderItem={({ item }) => <DiscussionCard show={item} cardWidth={cardWidth} />}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
});

// A station in the Radio row, shaped like an album card: the cover and song are what's on
// air now, and tapping opens the station's screen
// Stations refresh their song every minute only while Home is on screen
function StationCard({
  station,
  cardWidth,
  active,
}: {
  station: RadioStation;
  cardWidth: number;
  active: boolean;
}) {
  const router = useRouter();
  const { data: plays } = useQuery({
    ...queryRadioPlays(station),
    refetchInterval: active ? 60_000 : false,
  });
  const onAir = plays?.[0];
  const [failedArtwork, setFailedArtwork] = useState<string>();
  const onAirArtwork = onAir?.artwork;
  const rawImage = isQualityArtwork(onAirArtwork) ? onAirArtwork : station.artwork;

  if (!isQualityArtwork(rawImage) || failedArtwork === rawImage) return null;

  return (
    <Pressable
      android_ripple={{ color: theme.colors.ripple, borderless: false }}
      onPress={() => router.push({ pathname: "/station/[id]", params: { id: station.id } })}
      accessibilityLabel={`Open ${station.name}`}
      style={({ pressed }) => [styles.albumCard, { width: cardWidth }, pressed && styles.cardPressed]}
    >
      <View style={styles.cardImageContainer}>
        <Image
          source={{ uri: resolveArtworkUrl(rawImage) }}
          style={styles.cardCoverImage}
          resizeMode="cover"
          onError={() => setFailedArtwork(rawImage)}
        />
        <View style={styles.glassSheen} />
        <Text style={styles.airtimeBadge}>LIVE</Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {station.name}
      </Text>
      <Text style={styles.cardArtist} numberOfLines={1}>
        {onAir ? `${onAir.song} · ${onAir.artist}` : station.location}
      </Text>
    </Pressable>
  );
}

// A show in the Discussion row, shaped like an album card, and tapping opens the episode list
function DiscussionCard({ show, cardWidth }: { show: PodcastShow; cardWidth: number }) {
  const router = useRouter();
  const [failedArtwork, setFailedArtwork] = useState<string>();

  if (!isQualityArtwork(show.artwork) || failedArtwork === show.artwork) return null;

  return (
    <Pressable
      android_ripple={{ color: theme.colors.ripple, borderless: false }}
      onPress={() => router.push({ pathname: "/podcast/[id]", params: { id: show.id } })}
      accessibilityLabel={`Open ${show.name}`}
      style={({ pressed }) => [styles.albumCard, { width: cardWidth }, pressed && styles.cardPressed]}
    >
      <View style={styles.cardImageContainer}>
        <Image
          source={{ uri: resolveArtworkUrl(show.artwork) }}
          style={styles.cardCoverImage}
          resizeMode="cover"
          onError={() => setFailedArtwork(show.artwork)}
        />
        <View style={styles.glassSheen} />
        <Text style={styles.airtimeBadge}>TALK</Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {show.name}
      </Text>
      <Text style={styles.cardArtist} numberOfLines={1}>
        {show.author}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: theme.colors.background,
  },
  pane: {
    flex: 1,
  },
  hiddenPane: {
    flex: 1,
    display: "none",
  },
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceCardBorder,
    backgroundColor: theme.colors.surface,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  logoImage: {
    width: 28,
    height: 28,
    tintColor: theme.colors.logo,
  },
  brandWordmark: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandText: {
    fontFamily: theme.fonts.display,
    fontSize: 18,
    fontWeight: "normal",
    color: theme.colors.textPrimary,
    letterSpacing: 0.8,
  },
  brandHighlight: {
    color: theme.colors.primary,
    paddingRight: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  subscribeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
  },
  subscribeText: {
    fontFamily: theme.fonts.sans,
    color: theme.colors.playButtonIcon,
    fontSize: 14,
    fontWeight: "700",
  },
  searchButton: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  section: {
    marginTop: 22,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionHeader: {
    ...theme.typography.sectionHeader,
  },
  historyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    justifyContent: "space-between",
    rowGap: 8,
  },
  historyCard: {
    width: "48.5%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    height: 52,
  },
  historyThumb: {
    width: 52,
    height: 52,
    backgroundColor: theme.colors.surface,
  },
  thumbPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
  },
  historyTextContainer: {
    flex: 1,
    paddingHorizontal: 8,
  },
  historyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  historyArtist: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  carouselContent: {
    paddingHorizontal: 16,
    gap: 14,
  },
  albumCard: {
    marginRight: 2,
  },
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  cardImageContainer: {
    aspectRatio: 1,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    position: "relative",
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  cardCoverImage: {
    width: "100%",
    height: "100%",
  },
  glassSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "40%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  airtimeBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    backgroundColor: "rgba(7, 11, 20, 0.8)",
    color: theme.colors.textCyan,
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
    fontSize: 13,
    marginTop: 8,
  },
  cardArtist: {
    color: theme.colors.textCyan,
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },
  emptyCardTitle: {
    width: "75%",
    height: 18,
    marginTop: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
  },
  emptyCardArtist: {
    width: "50%",
    height: 16,
    marginTop: 2,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
  },
});
