import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as api from "../../queries/fetch/fetchWrapper";
import TrackGroupItem from "@/components/TrackGroupItem";
import SearchItem from "@/components/SearchItem";
import LoadingScreen from "@/components/LoadingScreen";
import OfflineNotice from "@/components/OfflineNotice";
import { openMainTab } from "@/components/Footer";
import { albumHref } from "@/scripts/routes";
import { isNetworkError } from "@/scripts/networkError";
import { findGenreByTag, getGenreExpansionTags } from "@/constants/genres";
import { fetchFederatedChorusAlbums } from "@/queries/chorus";
import { searchFairplayerAlbums } from "@/queries/fairplayer";
import { usePlayer } from "@/state/PlayerContext";
import { API_ROOT } from "@/constants/api-root";
import { API_KEY } from "@/constants/api-key";
import { audioTrackType, coverSizes, shuffle, trackStreamPath } from "@/scripts/utils";
import { Result } from "@/state/SearchContext";
import { theme } from "@/constants/theme";

function toPlayableTrack(rawTrack: any, album: AlbumProps): RNTrack | undefined {
  if (!rawTrack?.id || !rawTrack?.title) return undefined;
  const rawAudioUrl =
    rawTrack?.audio?.url || rawTrack?.url || trackStreamPath(rawTrack.id);
  const streamUrl = /^(https?|file):\/\//.test(rawAudioUrl)
    ? rawAudioUrl
    : `${API_ROOT}${rawAudioUrl.startsWith("/") ? "" : "/"}${rawAudioUrl}`;
  const artwork =
    album.cover?.sizes?.[600] ||
    album.cover?.sizes?.[300] ||
    album.cover?.sizes?.[120] ||
    rawTrack.artwork ||
    "";

  return {
    id: Number(rawTrack.id),
    title: rawTrack.title,
    artist: album.artist?.name || rawTrack.artist || "",
    artwork,
    url: streamUrl,
    allowIndividualSale: Boolean(rawTrack.allowIndividualSale),
    queueIndex: rawTrack.order ?? 0,
    trackGroupId: album.id,
    trackGroup: {
      id: album.id,
      trackGroupId: album.id,
      title: album.title,
      artist: album.artist,
      artistId: album.artistId,
      urlSlug: album.urlSlug,
      cover: album.cover || { sizes: coverSizes(artwork) },
      releaseDate: album.releaseDate || "",
      userTrackGroupPurchases: album.userTrackGroupPurchases || [],
      source: album.source || "Mirlo Space",
      sourceUrl: album.sourceUrl || "https://mirlo.space",
    },
    audio: {
      url: streamUrl,
      duration: rawTrack?.audio?.duration ?? rawTrack?.duration,
    },
    duration: rawTrack?.audio?.duration ?? rawTrack?.duration,
    isPreview: rawTrack.isPreview ?? true,
    order: rawTrack.order ?? 1,
    headers: rawTrack.headers || { "mirlo-api-key": API_KEY },
    type: audioTrackType(streamUrl),
    source: album.source || "Mirlo Space",
    sourceUrl: album.sourceUrl || "https://mirlo.space",
  };
}

export default function TagsView() {
  const { tag } = useLocalSearchParams();
  const rawTag = String(Array.isArray(tag) ? tag[0] : tag || "").trim();
  const matchedGenre = useMemo(() => findGenreByTag(rawTag), [rawTag]);
  const expansionTags = useMemo(() => getGenreExpansionTags(rawTag), [rawTag]);
  const [selectedSubTag, setSelectedSubTag] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"releases" | "tracks">("releases");

  const activeQueryTag = selectedSubTag === "all" ? rawTag : selectedSubTag;

  const {
    isPending,
    isError,
    data,
    error,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<{ results: AlbumProps[] }>({
    queryKey: ["infiniteTrackGroups", activeQueryTag, selectedSubTag],
    queryFn: async ({ pageParam = 0 }) => {
      const skip = Number(pageParam) || 0;
      const params = new URLSearchParams();
      params.append("skip", String(skip));
      params.append("take", String(20));
      params.append("tag", String(activeQueryTag));

      const primaryPage = await api.get<{ results: AlbumProps[] }>(
        `/v1/trackGroups?${params}`,
        {},
      );

      // On the first page of a Genre umbrella view, also pull from top sub-tags
      if (skip === 0 && selectedSubTag === "all" && expansionTags.length > 1) {
        const extraTags = expansionTags
          .filter((t) => t.toLowerCase() !== activeQueryTag.toLowerCase())
          .slice(0, 4);
        const extraPages = await Promise.allSettled(
          extraTags.map((t) =>
            api.get<{ results: AlbumProps[] }>(
              `/v1/trackGroups?tag=${encodeURIComponent(t)}&take=12`,
              {},
            ),
          ),
        );
        const combined = [...(primaryPage.results || [])];
        for (const p of extraPages) {
          if (p.status === "fulfilled" && p.value?.results) {
            combined.push(...p.value.results);
          }
        }
        return { results: combined };
      }

      return primaryPage;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.results.length >= 20 ? allPages.length * 10 : null;
    },
  });

  const { data: extraCatalogAlbums = [] } = useQuery({
    queryKey: ["tagCrossCatalog", activeQueryTag],
    queryFn: async ({ signal }) => {
      const targetTags =
        selectedSubTag === "all"
          ? expansionTags.map((t) => t.toLowerCase())
          : [activeQueryTag.toLowerCase()];
      const [chorusRes, fairRes] = await Promise.allSettled([
        fetchFederatedChorusAlbums({ take: 60 }, signal),
        searchFairplayerAlbums(activeQueryTag, signal),
      ]);
      const chorusMatches =
        chorusRes.status === "fulfilled"
          ? (chorusRes.value || []).filter((album) =>
              (album.tags || []).some((t) =>
                targetTags.some((target) => t.toLowerCase().includes(target)),
              ),
            )
          : [];
      const fairMatches =
        fairRes.status === "fulfilled" ? fairRes.value || [] : [];
      return [...chorusMatches, ...fairMatches];
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { top } = useSafeAreaInsets();
  const router = useRouter();
  const { playTrack } = usePlayer("playTrack");

  const trackGroups = useMemo(() => {
    const mirloPages = data?.pages.flatMap((page) => page.results) || [];
    const seen = new Set<string>();
    const deduped: AlbumProps[] = [];

    for (const album of [...mirloPages, ...extraCatalogAlbums]) {
      if (!album) continue;
      const key = `${album.artist?.name || album.artistId}:${album.title || album.id}`
        .toLowerCase()
        .trim();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(album);
    }
    return deduped;
  }, [data?.pages, extraCatalogAlbums]);

  const { trackResults, playableTracks } = useMemo(() => {
    const results: Result[] = [];
    const tracks: RNTrack[] = [];
    const seen = new Set<string>();

    for (const album of trackGroups) {
      for (const rawTrack of album.tracks || []) {
        if (rawTrack.isPreview === false) continue;
        const rnTrack = toPlayableTrack(rawTrack, album);
        if (!rnTrack) continue;
        const key = `${rnTrack.artist}:${rnTrack.title}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tracks.push(rnTrack);
        results.push({
          id: rnTrack.id,
          name: rnTrack.title,
          category: "Track",
          isTrack: true,
          artistId: album.artist?.urlSlug ?? album.artistId,
          artistName: album.artist?.name,
          albumTitle: album.title,
          trackGroupId: album.urlSlug ?? album.id,
          trackGroupCover: album.cover,
          matchedTag: activeQueryTag,
          track: rnTrack,
        });
      }
    }
    return { trackResults: results, playableTracks: tracks };
  }, [trackGroups, activeQueryTag]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const handlePlayGenreMix = () => {
    if (playableTracks.length === 0) return;
    const shuffled = shuffle(playableTracks);
    playTrack(shuffled[0], shuffled, matchedGenre?.name || `#${rawTag}`);
  };

  if (isPending) {
    return <LoadingScreen />;
  }

  if (isError && trackGroups.length === 0) {
    return (
      <OfflineNotice
        title={isNetworkError(error) ? "You're Offline" : `Can't Load #${rawTag}`}
        message={
          isNetworkError(error)
            ? "Can't reach Mirlo right now. Your downloaded music still plays."
            : error instanceof Error
              ? error.message
              : "Something went wrong loading these releases."
        }
        onDismiss={handleBack}
        onOpenLibrary={() => openMainTab("library")}
      />
    );
  }

  const renderLoadingFooter = () => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={{ marginVertical: 20 }}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
  };

  const accentColor = matchedGenre?.accent || theme.colors.primary;

  const listHeader = (
    <View style={styles.bannerContainer}>
      <View style={styles.bannerTopRow}>
        <View style={styles.bannerTextCol}>
          <Text style={styles.bannerTitle}>
            {matchedGenre ? matchedGenre.name : `#${rawTag}`}
          </Text>
          <Text style={styles.bannerSubtitle}>
            {matchedGenre
              ? matchedGenre.subtitle
              : `${trackGroups.length} releases · ${playableTracks.length} playable tracks`}
          </Text>
        </View>
        {playableTracks.length > 0 && (
          <TouchableOpacity
            onPress={handlePlayGenreMix}
            style={[styles.playMixBtn, { backgroundColor: accentColor }]}
            accessibilityRole="button"
            accessibilityLabel="Play genre mix"
          >
            <Ionicons name="shuffle" size={18} color={theme.colors.playButtonIcon} />
            <Text style={styles.playMixText}>Play Mix</Text>
          </TouchableOpacity>
        )}
      </View>

      {expansionTags.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subTagsRow}
        >
          <Pressable
            onPress={() => setSelectedSubTag("all")}
            style={[
              styles.subTagPill,
              selectedSubTag === "all" && {
                borderColor: accentColor,
                backgroundColor: theme.colors.primarySoftStrong,
              },
            ]}
          >
            <Text
              style={[
                styles.subTagText,
                selectedSubTag === "all" && { color: accentColor, fontWeight: "700" },
              ]}
            >
              All
            </Text>
          </Pressable>
          {expansionTags.map((subTag) => {
            const active = selectedSubTag === subTag;
            return (
              <Pressable
                key={subTag}
                onPress={() => setSelectedSubTag(subTag)}
                style={[
                  styles.subTagPill,
                  active && {
                    borderColor: accentColor,
                    backgroundColor: theme.colors.primarySoftStrong,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.subTagText,
                    active && { color: accentColor, fontWeight: "700" },
                  ]}
                >
                  #{subTag}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {trackResults.length > 0 && (
        <View style={styles.modeToggleRow}>
          <Pressable
            onPress={() => setViewMode("releases")}
            style={[
              styles.modeBtn,
              viewMode === "releases" && styles.modeBtnActive,
            ]}
          >
            <Text
              style={[
                styles.modeBtnText,
                viewMode === "releases" && styles.modeBtnTextActive,
              ]}
            >
              {`Releases (${trackGroups.length})`}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode("tracks")}
            style={[
              styles.modeBtn,
              viewMode === "tracks" && styles.modeBtnActive,
            ]}
          >
            <Text
              style={[
                styles.modeBtnText,
                viewMode === "tracks" && styles.modeBtnTextActive,
              ]}
            >
              {`Tracks (${trackResults.length})`}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.mainWrapper, { paddingTop: top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={theme.colors.textPrimary}
          />
        </Pressable>
        <Text style={[styles.headerTitle, { color: accentColor }]} numberOfLines={1}>
          {matchedGenre ? matchedGenre.name : `#${rawTag}`}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {viewMode === "tracks" ? (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={trackResults}
          keyExtractor={(item, index) => `track-${item.id}-${index}`}
          ListHeaderComponent={listHeader}
          renderItem={({ item, index }) => <SearchItem result={item} index={index} />}
        />
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={trackGroups}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          ListHeaderComponent={listHeader}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                const href = albumHref(item);
                if (href) router.push(href);
              }}
            >
              <TrackGroupItem
                id={item.id}
                cover={item.cover}
                title={item.title}
                artist={item.artist}
                artistId={item.artistId}
                urlSlug={item.urlSlug}
                userTrackGroupPurchases={item.userTrackGroupPurchases}
                releaseDate={item.releaseDate}
                tracks={item.tracks}
                trackGroupId={item.trackGroupId}
              />
            </Pressable>
          )}
          onEndReached={() => !isFetchingNextPage && fetchNextPage()}
          onEndReachedThreshold={0.2}
          ListFooterComponent={renderLoadingFooter}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceCardBorder,
    backgroundColor: theme.colors.surface,
  },
  backBtn: {
    padding: 6,
  },
  headerTitle: {
    ...theme.typography.sectionHeader,
    fontSize: 15,
    color: theme.colors.primary,
  },
  bannerContainer: {
    marginBottom: 12,
    gap: 12,
  },
  bannerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  bannerTextCol: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  bannerSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  playMixBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: theme.radius.full,
  },
  playMixText: {
    color: theme.colors.playButtonIcon,
    fontWeight: "700",
    fontSize: 13,
  },
  subTagsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  subTagPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
  },
  subTagText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  modeToggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
  },
  modeBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  modeBtnTextActive: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
    gap: 4,
  },
});
