import {
  Text,
  View,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { usePlayer } from "@/state/PlayerContext";
import { audioTrackType, isTrackOwnedOrPreview, linkifyUrls, htmlToMarkdown } from "@/scripts/utils";
import { useQuery } from "@tanstack/react-query";
import { queryAlbum } from "@/queries/queries";
import { resolveFeedSourceName } from "@/queries/chorus";
import { fairplayerReleaseSlug } from "@/queries/fairplayer";
import { openInBrowser } from "@/scripts/openInBrowser";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_ROOT } from "@/constants/api-root";
import { API_KEY } from "@/constants/api-key";
import Ionicons from "@expo/vector-icons/Ionicons";
import PlayPauseWrapper from "@/components/PlayPauseWrapper";
import Markdown from "react-native-markdown-display";
import WishlistButton from "@/components/WishlistButton";
import ErrorNotification from "@/components/ErrorNotification";
import AddAlbumButton from "@/components/AddAlbumButton";
import DownloadAlbumButton from "@/components/DownloadAlbumButton";
import { theme } from "@/constants/theme";
import TagPill from "@/components/TagPill";
import { recordHistoryItem } from "@/scripts/historyManager";
import { SAVED_SOURCE, downloadedAlbumMatcher, useDownloads } from "@/scripts/downloadManager";
import LoadingScreen from "@/components/LoadingScreen";

type DateTimeFormatOptions = Intl.DateTimeFormatOptions;

function AlbumPlayButton({ playableTracks }: { playableTracks: RNTrack[] }) {
  const { isPlaying, activeTrack, playTrack, togglePlayPause } = usePlayer("isPlaying", "activeTrack", "playTrack", "togglePlayPause");

  const isCurrentAlbum = Boolean(
    activeTrack &&
      playableTracks.length > 0 &&
      ((activeTrack.trackGroup?.urlSlug &&
        activeTrack.trackGroup.urlSlug === playableTracks[0]?.trackGroup?.urlSlug) ||
        playableTracks.some(
          (t) =>
            (t.id !== undefined && t.id === activeTrack.id) ||
            (Boolean(t.url) && t.url === activeTrack.url),
        )),
  );

  const togglePlayback = useCallback(() => {
    if (!playableTracks.length) return;
    if (isCurrentAlbum) {
      togglePlayPause();
    } else {
      playTrack(playableTracks[0], playableTracks);
    }
  }, [isCurrentAlbum, playableTracks, playTrack, togglePlayPause]);

  return (
    <TouchableOpacity
      onPress={togglePlayback}
      disabled={!playableTracks.length}
      accessibilityRole="button"
      accessibilityLabel={isCurrentAlbum && isPlaying ? "Pause Album" : "Play Album"}
      style={styles.albumPlayBtn}
    >
      <Ionicons
        name={
          playableTracks.length && isCurrentAlbum && isPlaying
            ? "pause"
            : "play"
        }
        size={24}
        color={theme.colors.playButtonIcon}
        style={
          playableTracks.length && isCurrentAlbum && isPlaying
            ? undefined
            : { transform: [{ translateX: 2 }] }
        }
      />
    </TouchableOpacity>
  );
}

const MemoizedAlbumPlayButton = React.memo(AlbumPlayButton);

function formatUTCDate(utcDate: string | undefined) {
  if (!utcDate) return undefined;
  const date = new Date(utcDate);

  // Account for timezone offset
  const localDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);

  const options: DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    year: "numeric",
  };
  const result = localDate.toLocaleDateString("en-US", options);

  return date.getTime() > Date.now() ? `Release date: ${result}` : `Released: ${result}`;
}

export default function AlbumTracks() {
  const { id, slug } = useLocalSearchParams();
  const { isPending, isError, data, error } = useQuery(
    queryAlbum({ slug: slug, id: id }),
  );
  const router = useRouter();
  const { disabledTrackIds } = usePlayer("disabledTrackIds");
  const downloads = useDownloads();
  const [showError, setShowError] = useState<boolean>(true);

  useEffect(() => {
    if (!data?.result) return;
    const coverUri =
      data.result.cover?.sizes?.[300] ||
      data.result.cover?.sizes?.[600] ||
      data.result.cover?.sizes?.[120];
    const savedAlbum = (data.result.tracks?.[0] as RNTrack | undefined)?.downloadAlbum;
    recordHistoryItem(
      data.result.source === SAVED_SOURCE && savedAlbum
        ? {
            downloadAlbum: savedAlbum,
            title: data.result.title,
            artistName: data.result.artist?.name || "",
            coverUri,
          }
        : {
            id: data.result.id,
            artistId: data.result.artistId,
            urlSlug: data.result.urlSlug,
            title: data.result.title,
            artistName: data.result.artist?.name || "",
            coverUri,
          },
    );
  }, [data?.result]);

  const { allTracks: album, playableTracks } = useMemo(() => {
    const tracksToPlay: RNTrack[] = [];
    const allTracks: RNTrack[] = [];
    let playableIndex = 0;

    if (data?.result) {
      const fallbackAlbumSource =
        data.result.source ||
        resolveFeedSourceName(
          data.result.tracks?.[0]?.url || data.result.tracks?.[0]?.audio?.url,
        );
      data.result.source = fallbackAlbumSource;

      const resolvedAlbumId = data.result.id || data.result.trackGroupId;

      data.result.tracks?.forEach((track) => {
        const rawAudioUrl = track.audio?.url || track.url || "";
        const streamUrl = /^(https?|file):\/\//.test(rawAudioUrl)
          ? rawAudioUrl
          : `${API_ROOT}${rawAudioUrl.startsWith("/") ? "" : "/"}${rawAudioUrl}`;
        const trackSource =
          track.source ||
          data.result.source ||
          (streamUrl.startsWith("http")
            ? resolveFeedSourceName(streamUrl)
            : "Mirlo Space");
        const trackSourceUrl = track.sourceUrl || data.result.sourceUrl;
        const trackAlbumId = resolvedAlbumId || track.trackGroupId;

        const newTrack: RNTrack = {
          title: track.title,
          artist: data.result.artist.name,
          artwork: data.result.cover.sizes[600],
          url: streamUrl,
          allowIndividualSale: track.allowIndividualSale,
          id: track.id,
          trackArtists: track.trackArtists,
          queueIndex: track.order,
          trackGroupId: trackAlbumId,
          trackGroup: {
            userTrackGroupPurchases: data.result.userTrackGroupPurchases,
            artistId: data.result.artistId,
            urlSlug: data.result.urlSlug,
            cover: data.result.cover,
            title: data.result.title,
            artist: data.result.artist,
            id: data.result.id,
            releaseDate: data.result.releaseDate,
            trackGroupId: trackAlbumId,
            source: trackSource,
            sourceUrl: trackSourceUrl,
            purchaseLinks: data.result.purchaseLinks,
          },
          audio: {
            url: streamUrl,
            duration: track.audio?.duration ?? track.duration,
          },
          isPreview: track.isPreview,
          order: track.order,
          headers: track.headers || {
            "mirlo-api-key": API_KEY,
          },
          type: audioTrackType(streamUrl),
          source: trackSource,
          sourceUrl: trackSourceUrl,
          fairplayerTrackId: track.fairplayerTrackId,
        };

        allTracks.push(newTrack);

        if (isTrackOwnedOrPreview(newTrack, null, data.result, disabledTrackIds)) {
          newTrack.queueIndex = playableIndex;
          playableIndex++;
          tracksToPlay.push(newTrack);
        }
      });
    }

    return { allTracks, playableTracks: tracksToPlay };
  }, [data, disabledTrackIds]);

  if (isPending) {
    return (
      <LoadingScreen />
    );
  }

  if (isError) {
    return (
      <View style={styles.loadingContainer}>
        <ErrorNotification
          visible={showError}
          onDismiss={() => setShowError(false)}
          error={error}
        />
      </View>
    );
  }

  const selectedAlbum = data.result;
  const isSavedPage = selectedAlbum.source === SAVED_SOURCE;
  const onDevice = isSavedPage || downloadedAlbumMatcher(downloads)(selectedAlbum);
  const albumSource =
    selectedAlbum?.source ||
    (selectedAlbum?.tracks?.[0]?.source) ||
    resolveFeedSourceName(selectedAlbum?.tracks?.[0]?.url || selectedAlbum?.tracks?.[0]?.audio?.url);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.topNav}>
        <Pressable
          onPress={() => router.dismiss()}
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
      </View>
      <View style={styles.container}>
        <FlatList
          style={{ width: "100%" }}
          contentContainerStyle={styles.listContainer}
          data={album}
          keyExtractor={(item, index) => `${index}-${item.id || item.title}`}
          renderItem={({ item }) =>
            selectedAlbum ? (
              <PlayPauseWrapper
                trackObject={item}
                playableTracks={playableTracks}
                selectedAlbum={selectedAlbum}
              />
            ) : null
          }
          ListHeaderComponent={
            <View style={styles.headerSection}>
              <View style={styles.coverWrapper}>
                <Image
                  source={{ uri: selectedAlbum?.cover?.sizes[600] }}
                  style={styles.coverImage}
                  resizeMode="cover"
                />
              </View>
              <View style={styles.albumMetaRow}>
                <View style={styles.metaTitles}>
                  <Text
                    style={styles.albumMainTitle}
                    ellipsizeMode="tail"
                    numberOfLines={1}
                  >
                    {selectedAlbum?.title}
                  </Text>
                  <View style={styles.artistNameRow}>
                    <Text style={styles.byText}>
                      {"by "}
                    </Text>
                    <Pressable
                      onPress={() =>
                        router.navigate({
                          pathname: "/artist/[id]/artist-page",
                          params: {
                            id: fairplayerReleaseSlug.artistPageRouteId(selectedAlbum),
                          },
                        })
                      }
                    >
                      <Text style={styles.artistLink}>
                        {selectedAlbum?.artist.name}
                      </Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.albumActions}>
                  {!isSavedPage && (
                    <>
                      {!onDevice && (
                        <>
                          <AddAlbumButton
                            trackGroup={selectedAlbum}
                            size={36}
                          />
                          <DownloadAlbumButton album={selectedAlbum} size={36} />
                        </>
                      )}
                      <WishlistButton
                        trackGroup={selectedAlbum}
                        displayedTracks={album}
                        size={36}
                        style={{ marginHorizontal: 8 }}
                      />
                    </>
                  )}
                  <MemoizedAlbumPlayButton playableTracks={playableTracks} />
                </View>
              </View>
            </View>
          }
          ListFooterComponent={
            <View style={styles.footerSection}>
              <Text style={styles.aboutHeader}>
                About
              </Text>
              <Text style={styles.releaseDateText}>
                {formatUTCDate(selectedAlbum?.releaseDate)}
              </Text>
              {albumSource ? (
                <Pressable
                  disabled={!selectedAlbum?.sourceUrl}
                  onPress={() => {
                    if (selectedAlbum?.sourceUrl) {
                      openInBrowser(selectedAlbum.sourceUrl);
                    }
                  }}
                  style={styles.footerSourceRow}
                >
                  <Ionicons
                    name="globe-outline"
                    size={12}
                    color={
                      selectedAlbum?.sourceUrl
                        ? theme.colors.textCyan
                        : theme.colors.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.footerSourceText,
                      selectedAlbum?.sourceUrl && { color: theme.colors.textCyan },
                    ]}
                  >
                    {albumSource}
                  </Text>
                </Pressable>
              ) : null}

              {selectedAlbum?.about ? (
                <View style={styles.aboutBody}>
                  <Markdown
                    onLinkPress={(url) => {
                      openInBrowser(url);
                      return false;
                    }}
                    style={{
                      body: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 },
                      link: { color: theme.colors.textCyan },
                    }}
                  >
                    {linkifyUrls(
                      htmlToMarkdown(selectedAlbum.about).replace(/([^\n])\n([^\n])/g, "$1 $2"),
                    )}
                  </Markdown>
                </View>
              ) : null}

              <View style={styles.tagWrap}>
                {selectedAlbum.tags?.map((tagName: string, index: number) => (
                  <TagPill key={index} tagName={tagName} />
                ))}
              </View>
            </View>
          }
        />
      </View>
    </SafeAreaView>
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
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
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
  sourceTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  sourceTagText: {
    color: theme.colors.textCyan,
    fontSize: 12,
    fontWeight: "500",
  },
  albumActions: {
    flexDirection: "row",
    alignItems: "center",
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
  releaseDateText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontStyle: "italic",
    marginBottom: 6,
  },
  footerSourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 14,
  },
  footerSourceText: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  aboutBody: {
    marginBottom: 16,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
});
