import { useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Pressable,
} from "react-native";
import DropletSpinner from "@/components/DropletSpinner";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePlayer } from "@/state/PlayerContext";
import {
  findPodcastShow,
  queryPodcastEpisodes,
  episodeTrack,
  PodcastEpisode,
} from "@/queries/podcast";
import AddToQueueButton from "@/components/AddToQueueButton";
import ShowBookmarkButton from "@/components/ShowBookmarkButton";
import { theme } from "@/constants/theme";
import {
  isQualityArtwork,
  resolveArtworkUrl,
} from "@/scripts/utils";

function formatPubDate(raw: string): string {
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return raw;
  }
}

function formatEpisodeDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const sPad = s < 10 ? `0${s}` : `${s}`;
  if (h > 0) {
    const mPad = m < 10 ? `0${m}` : `${m}`;
    return `${h}:${mPad}:${sPad}`;
  }
  const mPad = m < 10 ? `0${m}` : `${m}`;
  return `${mPad}:${sPad}`;
}

// Dedicated screen for a Discussion/Podcast show, styled identically to Album and Radio screens.
export default function PodcastScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const show = findPodcastShow(id);
  const router = useRouter();
  const { data: episodes = [], isPending, isError, refetch } = useQuery(queryPodcastEpisodes(show));
  const { activeTrack, isPlaying, playTrack, togglePlayPause } = usePlayer("activeTrack", "isPlaying", "playTrack", "togglePlayPause");
  const [imgError, setImgError] = useState(false);

  if (!show || !isQualityArtwork(show.artwork)) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.topNav}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>Show not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const allTracks = episodes.map((ep, idx) => episodeTrack(ep, show, idx));
  const isShowPlaying = activeTrack?.podcastId === show.id;

  const toggleShowPlayback = () => {
    if (allTracks.length === 0) return;
    if (isShowPlaying) {
      togglePlayPause();
    } else {
      playTrack(allTracks[0], allTracks, show.name);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.topNav}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      <FlatList
        style={styles.container}
        contentContainerStyle={styles.listContainer}
        data={episodes}
        keyExtractor={(ep) => ep.id}
        renderItem={({ item, index }) => {
          const track = allTracks[index] || episodeTrack(item, show, index);
          const isThisEpisode =
            activeTrack?.podcastEpisodeId === item.id || activeTrack?.url === item.audioUrl;

          return (
            <EpisodeRow
              episode={item}
              track={track}
              isCurrent={isThisEpisode}
              onPress={() => {
                if (isThisEpisode) {
                  togglePlayPause();
                } else {
                  playTrack(track, allTracks, show.name);
                }
              }}
            />
          );
        }}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            <View style={styles.coverWrapper}>
              {!imgError && isQualityArtwork(show.artwork) && (
                <Image
                  source={{ uri: resolveArtworkUrl(show.artwork) }}
                  style={styles.coverImage}
                  resizeMode="cover"
                  onError={() => setImgError(true)}
                />
              )}
            </View>

            <View style={styles.albumMetaRow}>
              <View style={styles.metaTitles}>
                <Text style={styles.albumMainTitle} numberOfLines={1} ellipsizeMode="tail">
                  {show.name}
                </Text>
                <View style={styles.artistNameRow}>
                  <Text style={styles.byText}>by </Text>
                  <Text style={styles.artistLink} numberOfLines={1}>
                    {show.author}
                  </Text>
                </View>
              </View>

              <View style={styles.albumActions}>
                {allTracks.length > 0 && (
                  <AddToQueueButton track={allTracks[0]} size={28} />
                )}
                <ShowBookmarkButton show={show} size={28} />
                <TouchableOpacity
                  onPress={toggleShowPlayback}
                  disabled={allTracks.length === 0}
                  accessibilityRole="button"
                  accessibilityLabel={isShowPlaying && isPlaying ? "Pause show" : "Play show"}
                  style={styles.albumPlayBtn}
                >
                  <Ionicons
                    name={isShowPlaying && isPlaying ? "pause" : "play"}
                    size={24}
                    color={theme.colors.playButtonIcon}
                    style={
                      isShowPlaying && isPlaying
                        ? undefined
                        : { transform: [{ translateX: 2 }] }
                    }
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          isPending ? (
            <DropletSpinner size={38} style={{ marginVertical: 36 }} />
          ) : isError ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Unable to load episodes from the feed.</Text>
              <Pressable onPress={() => refetch()} style={styles.retryBtn}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No episodes available.</Text>
            </View>
          )
        }
        ListFooterComponent={
          show.description ? (
            <View style={styles.footerSection}>
              <Text style={styles.aboutHeader}>About</Text>
              <Text style={styles.aboutText}>{show.description}</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function EpisodeRow({
  episode,
  track,
  isCurrent,
  onPress,
}: {
  episode: PodcastEpisode;
  track: RNTrack;
  isCurrent: boolean;
  onPress: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const durationText = formatEpisodeDuration(episode.duration);
  const dateText = formatPubDate(episode.pubDate);
  const artworkUri = isQualityArtwork(episode.artwork) ? episode.artwork : track.artwork;
  const thumbSource = (!imgError && isQualityArtwork(artworkUri))
    ? { uri: resolveArtworkUrl(artworkUri) }
    : undefined;

  return (
    <View style={[styles.listItem, isCurrent && styles.selectedListItem]}>
      <Pressable
        onPress={onPress}
        style={styles.trackDetailsRow}
        accessibilityRole="button"
        accessibilityLabel={`Play ${episode.title}`}
      >
        <Image
          source={thumbSource}
          style={styles.trackThumb}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
        <View style={styles.titleContainer}>
          <Text
            style={[
              styles.titleText,
              {
                color: isCurrent ? theme.colors.primary : theme.colors.textPrimary,
                fontWeight: isCurrent ? "700" : "500",
              },
            ]}
            ellipsizeMode="tail"
            numberOfLines={1}
          >
            {episode.title}
          </Text>
          {dateText ? (
            <Text numberOfLines={1} style={styles.contributorText}>
              {dateText}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.actionRow}>
        <AddToQueueButton track={track} size={17} />
        {durationText ? (
          <Text
            style={[
              styles.durationText,
              {
                color: isCurrent ? theme.colors.primary : theme.colors.textSecondary,
                fontWeight: isCurrent ? "700" : "400",
              },
            ]}
          >
            {durationText}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 52,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceCardBorder,
  },
  backBtn: {
    padding: 6,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: theme.colors.background,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  headerSection: {
    marginBottom: 16,
    paddingTop: 12,
  },
  coverWrapper: {
    width: "100%",
    maxWidth: theme.coverMaxSize,
    alignSelf: "center",
    aspectRatio: 1,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
    marginBottom: 16,
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
  },
  albumMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaTitles: {
    flex: 1,
    marginRight: 12,
  },
  albumMainTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  artistNameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  byText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  artistLink: {
    color: theme.colors.textCyan,
    fontSize: 14,
    fontWeight: "600",
  },
  albumActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  albumPlayBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: "space-between",
    marginVertical: 2,
    borderRadius: theme.radius.sm,
  },
  selectedListItem: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
  },
  trackDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flex: 1,
    paddingRight: 10,
  },
  trackThumb: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.sm,
    marginRight: 10,
    backgroundColor: theme.colors.surfaceElevated,
  },
  titleContainer: {
    flex: 1,
  },
  titleText: {
    fontSize: 15,
  },
  contributorText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  durationText: {
    fontSize: 13,
  },
  errorContainer: {
    paddingVertical: 32,
    alignItems: "center",
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.full,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.playButtonIcon,
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  footerSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surfaceCardBorder,
  },
  aboutHeader: {
    ...theme.typography.sectionHeader,
    fontSize: 13,
    marginBottom: 4,
  },
  aboutText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
});
