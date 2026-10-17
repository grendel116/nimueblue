import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMemo, type ComponentProps } from "react";
import { usePlayer } from "@/state/PlayerContext";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";
import AddToQueueButton from "@/components/AddToQueueButton";
import DownloadsTab from "@/components/DownloadsTab";
import FavoriteTrackButton from "@/components/FavoriteTrackButton";
import {
  DownloadedTrack,
  groupTracksIntoAlbums,
  sameAlbum,
  useDownloads,
} from "@/scripts/downloadManager";
import { fairplayerReleaseSlug } from "@/queries/fairplayer";
import { resolveArtworkUrl } from "@/scripts/utils";
import { useStationLikes } from "@/scripts/stationLikes";
import { usePodcastEpisodeLikes, PodcastEpisodeLike } from "@/scripts/podcastLikes";
import {
  useFaircampSaves,
  FaircampSaves,
  toggleFaircampArtistFollow,
} from "@/scripts/faircampSaves";
import { dragScroll } from "@/scripts/dragScroll";
import { findStation, liveTrack } from "@/queries/radio";
import { hashString } from "@/queries/podcast";
import { FollowedArtist } from "@/queries/listener";
import { LibraryTab, setLibraryTab, useLibraryTab } from "@/state/libraryTab";

type IconName = ComponentProps<typeof Ionicons>["name"];

export function albumCover(tg: any): string {
  return resolveArtworkUrl(
    tg?.cover?.sizes?.[300] ||
      tg?.cover?.sizes?.[120] ||
      tg?.cover?.sizes?.[600] ||
      (typeof tg?.cover === "string" ? tg.cover : tg?.cover?.url),
  );
}

// The page of a release, where the listener can play or buy it
export function albumPageHref(tg: any) {
  if (!tg?.urlSlug || !(tg.artistId || fairplayerReleaseSlug.decode(String(tg.urlSlug)))) {
    return undefined;
  }
  return {
    pathname: "/artist/[id]/album/[slug]/album-tracks" as const,
    params: {
      id:
        fairplayerReleaseSlug.artistRouteId(String(tg.urlSlug)) ??
        String(tg.artist?.urlSlug || tg.artistId),
      slug: String(tg.urlSlug),
    },
  };
}

export type WishlistAlbum = { trackGroup: AlbumProps; savedAt: number };

// One record, one box: an album moves from Wishlist to Downloads once saved on the device.
// Downloaded files carry a title and artist, and an album with the same title and artist is
// that album.
function downloadedAlbumMatcher(downloads: DownloadedTrack[]) {
  const saved = groupTracksIntoAlbums(downloads);
  return (trackGroup: any) =>
    saved.some((a) =>
      sameAlbum(
        { title: a.title, artist: a.artist },
        { title: trackGroup?.title, artist: trackGroup?.artist?.name },
      ),
    );
}

// Wishlist: albums saved on the device or holding a liked song, newest first.
// Albums already downloaded move out to Downloads. Each album opens its page.
export function buildWishlistAlbums({
  faircampSaves,
  downloads = [],
}: {
  faircampSaves: FaircampSaves;
  downloads?: DownloadedTrack[];
}): WishlistAlbum[] {
  const albums = new Map<string, WishlistAlbum>();
  const isDownloaded = downloadedAlbumMatcher(downloads);
  const keep = (trackGroup: any, savedAt: number) => {
    if (!trackGroup || isDownloaded(trackGroup)) return;
    const key = String(trackGroup.urlSlug || trackGroup.id);
    const existing = albums.get(key);
    albums.set(key, {
      trackGroup: existing?.trackGroup ?? trackGroup,
      savedAt: Math.max(existing?.savedAt ?? 0, savedAt),
    });
  };

  faircampSaves.albums.forEach(({ album, savedAt }) => keep(album, savedAt));
  faircampSaves.tracks.forEach(({ track, likedAt }) => keep(track.trackGroup, likedAt));

  return Array.from(albums.values()).sort((a, b) => b.savedAt - a.savedAt);
}

function episodeTrack(ep: PodcastEpisodeLike): RNTrack {
  return {
    id: -(Math.abs(hashString(`ep-${ep.episodeId}`)) || 600000),
    title: ep.title,
    artist: ep.artist,
    artwork: ep.artwork || "",
    url: ep.url,
    type: "default",
    duration: ep.duration,
    order: 1,
    queueIndex: 0,
    allowIndividualSale: false,
    isPreview: false,
    audio: {
      url: ep.url,
      duration: ep.duration,
    },
    trackGroupId: 0,
    podcastId: ep.showId,
    podcastEpisodeId: ep.episodeId,
  } as RNTrack;
}

// Artists followed on this device
export function buildFollowedArtists({
  faircampSaves,
}: {
  faircampSaves?: FaircampSaves;
}): FollowedArtist[] {
  return (faircampSaves?.artists ?? []).map(({ artist }): FollowedArtist => ({
    artist,
  }));
}

// Bookmarks: liked radio stations and podcast episodes, kept on the device, newest first
export function buildBookmarks({
  stationLikes,
  podcastEpisodeLikes = [],
}: {
  stationLikes: { stationId: string; likedAt: number }[];
  podcastEpisodeLikes?: PodcastEpisodeLike[];
}): RNTrack[] {
  const stations = stationLikes.flatMap(({ stationId, likedAt }) => {
    const station = findStation(stationId);
    return station ? [{ track: liveTrack(station), likedAt }] : [];
  });
  const episodes = podcastEpisodeLikes.map((ep) => ({ track: episodeTrack(ep), likedAt: ep.likedAt }));
  return [...stations, ...episodes]
    .sort((a, b) => b.likedAt - a.likedAt)
    .map(({ track }) => track);
}

export default function LibraryScreen() {
  const router = useRouter();
  const { playTrack, activeTrack } = usePlayer("playTrack", "activeTrack");
  const activeTab = useLibraryTab();
  const downloadedTracks = useDownloads();
  const stationLikes = useStationLikes();
  const podcastEpisodeLikes = usePodcastEpisodeLikes();
  const faircampSaves = useFaircampSaves();

  const downloadedAlbums = useMemo(
    () => groupTracksIntoAlbums(downloadedTracks),
    [downloadedTracks],
  );

  const wishlistAlbums = useMemo(
    () =>
      buildWishlistAlbums({
        faircampSaves,
        downloads: downloadedTracks,
      }),
    [faircampSaves, downloadedTracks],
  );
  const artists = useMemo(
    () => buildFollowedArtists({ faircampSaves }),
    [faircampSaves],
  );
  const bookmarks = useMemo(
    () => buildBookmarks({ stationLikes, podcastEpisodeLikes }),
    [stationLikes, podcastEpisodeLikes],
  );

  const tabs: { id: LibraryTab; label: string; icon: IconName; count: number }[] = [
    { id: "wishlist", label: "Wishlist", icon: "heart-outline", count: wishlistAlbums.length },
    {
      id: "downloads",
      label: "Downloads",
      icon: "download-outline",
      count: downloadedAlbums.length,
    },
    { id: "artists", label: "Artists", icon: "people-outline", count: artists.length },
    { id: "bookmarks", label: "Bookmarks", icon: "bookmark-outline", count: bookmarks.length },
  ];

  const renderEmpty = (icon: IconName, title: string, subtitle: string) => (
    <View style={styles.emptyContainer}>
      <Ionicons name={icon} size={48} color={theme.colors.textMuted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );

  const openAlbumPage = (tg: any) => {
    const href = albumPageHref(tg);
    if (href) router.push(href);
  };

  // One row for a release: cover, two lines of text, and a tap to its album page
  const renderReleaseCard = (tg: any, title: string, subtitle: string, fallbackIcon: IconName) => {
    const coverUri = albumCover(tg);
    return (
      <Pressable
        android_ripple={{ color: theme.colors.ripple }}
        onPress={() => openAlbumPage(tg)}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.placeholder]}>
            <Ionicons name={fallbackIcon} size={20} color={theme.colors.primary} />
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.cardArtist} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
      </Pressable>
    );
  };

  const renderWishlist = () => {
    if (wishlistAlbums.length === 0) {
      return renderEmpty(
        "heart-outline",
        "No saved albums",
        "Tap the heart on any song or album to save its album to your wishlist.",
      );
    }
    return (
      <FlatList
        data={wishlistAlbums}
        keyExtractor={(item, index) => `album-${item.trackGroup?.urlSlug}-${index}`}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={5}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) =>
          renderReleaseCard(
            item.trackGroup,
            item.trackGroup?.title || "Saved Album",
            item.trackGroup?.artist?.name || "Artist",
            "heart",
          )
        }
      />
    );
  };

  const renderArtists = () => {
    if (artists.length === 0) {
      return renderEmpty(
        "people-outline",
        "No followed artists",
        "Follow an artist from their page to keep them in your library.",
      );
    }
    return (
      <FlatList
        data={artists}
        keyExtractor={({ artist }) => `artist-${artist.urlSlug ?? artist.id}`}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <FollowedArtistRow
            followed={item}
            onOpen={() =>
              router.push({
                pathname: "/artist/[id]/artist-page",
                params: { id: item.artist.urlSlug ?? String(item.artist.id) },
              })
            }
          />
        )}
      />
    );
  };

  const renderBookmarks = () => {
    if (bookmarks.length === 0) {
      return renderEmpty(
        "bookmark-outline",
        "No bookmarks yet",
        "Like a radio station or podcast episode to keep it here.",
      );
    }
    return (
      <FlatList
        data={bookmarks}
        keyExtractor={(item) => `bookmark-${item.liveStation ?? item.podcastEpisodeId}`}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={5}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isSelected = Boolean(activeTrack?.url && activeTrack.url === item.url);
          return (
            <Pressable
              android_ripple={{ color: theme.colors.ripple }}
              onPress={() => playTrack(item, bookmarks, "Bookmarks")}
              style={({ pressed }) => [
                styles.card,
                isSelected && styles.selectedCard,
                pressed && styles.cardPressed,
              ]}
            >
              {item.artwork ? (
                <Image source={{ uri: item.artwork }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.placeholder]}>
                  <Ionicons name="radio-outline" size={20} color={theme.colors.primary} />
                </View>
              )}
              <View style={styles.cardInfo}>
                <Text
                  style={[
                    styles.cardTitle,
                    isSelected && { color: theme.colors.primary, fontWeight: "700" },
                  ]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text style={styles.cardArtist} numberOfLines={1}>
                  {item.artist}
                </Text>
              </View>
              <View style={styles.actionRow}>
                <AddToQueueButton track={item} size={17} />
                <FavoriteTrackButton track={item} size={17} />
              </View>
            </Pressable>
          );
        }}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleCol}>
            <Text style={styles.title}>Your Library</Text>
            <Text style={styles.subtitle}>
              Your wishlist, downloads, artists & bookmarks
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push("/aboutModal")}
              style={[styles.headerPill, { width: 36, paddingHorizontal: 0, justifyContent: "center" }]}
              accessibilityRole="button"
              accessibilityLabel="About NimueBlue"
            >
              <Ionicons name="information-circle-outline" size={16} color={theme.colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* Scrollable Segmented Toggle Pills */}
        <ScrollView
          ref={dragScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toggleRow}
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                android_ripple={{ color: theme.colors.ripple, borderless: true, radius: 24 }}
                onPress={() => setLibraryTab(tab.id)}
                style={({ pressed }) => [
                  styles.togglePill,
                  active && styles.togglePillActive,
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={active ? theme.colors.playButtonIcon : theme.colors.textSecondary}
                />
                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                  {tab.label} ({tab.count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.contentArea}>
        {activeTab === "wishlist" && renderWishlist()}
        {activeTab === "downloads" && <DownloadsTab />}
        {activeTab === "artists" && renderArtists()}
        {activeTab === "bookmarks" && renderBookmarks()}
      </View>
    </SafeAreaView>
  );
}

// A followed artist: avatar and name open their page, with an Unfollow button
function FollowedArtistRow({ followed, onOpen }: { followed: FollowedArtist; onOpen: () => void }) {
  const { artist } = followed;
  const avatarUri = resolveArtworkUrl(
    artist.avatar?.sizes?.[120] || artist.avatar?.sizes?.[300] || artist.avatar?.url,
  );
  const handleUnfollow = () => {
    toggleFaircampArtistFollow(artist);
  };
  return (
    <Pressable
      android_ripple={{ color: theme.colors.ripple }}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {avatarUri ? (
        <Image source={{ uri: avatarUri }} style={[styles.thumb, styles.avatar]} />
      ) : (
        <View style={[styles.thumb, styles.avatar, styles.placeholder]}>
          <Ionicons name="person" size={20} color={theme.colors.primary} />
        </View>
      )}
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {artist.name}
        </Text>
        <Text style={styles.cardArtist}>Following</Text>
      </View>
      <TouchableOpacity
        onPress={handleUnfollow}
        style={styles.unfollowBtn}
        accessibilityRole="button"
        accessibilityLabel={`Unfollow ${artist.name}`}
      >
        <Text style={styles.unfollowText}>Unfollow</Text>
      </TouchableOpacity>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceCardBorder,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  headerTitleCol: {
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 18,
    fontWeight: "normal",
    color: theme.colors.textPrimary,
    letterSpacing: 0.8,
  },
  subtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  togglePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
  },
  togglePillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  toggleTextActive: {
    color: theme.colors.playButtonIcon,
    fontWeight: "700",
  },
  listContent: {
    padding: 12,
    paddingBottom: 80,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
  },
  cardPressed: {
    opacity: 0.75,
    backgroundColor: theme.colors.surfaceElevated,
  },
  selectedCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderColor: theme.colors.primary,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 8,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceElevated,
  },
  placeholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  avatar: {
    borderRadius: 24,
  },
  unfollowBtn: {
    minWidth: 84,
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    backgroundColor: theme.colors.surfaceElevated,
  },
  unfollowText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  cardArtist: {
    color: theme.colors.textCyan,
    fontSize: 12,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 10,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  emptySubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
});
