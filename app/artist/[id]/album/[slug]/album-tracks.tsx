import {
  Text,
  View,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Pressable,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { usePlayer } from "@/state/PlayerContext";
import { isSameTrack } from "@/state/player/trackUtils";
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
import AddAlbumButton from "@/components/AddAlbumButton";
import { theme } from "@/constants/theme";
import TagPill from "@/components/TagPill";
import { recordHistoryItem } from "@/scripts/historyManager";
import {
  SAVED_PREFIX,
  SAVED_SOURCE,
  albumTitleKey,
  downloadedAlbumMatcher,
  useDownloads,
  groupTracksIntoAlbums,
  mergeAlbumWithDownloads,
  savedAlbumSlug,
  savedArtistSlug,
  savedAlbumPage,
  sameAlbum,
  nameKey,
} from "@/scripts/downloadManager";
import {
  PICKS_PHONE_FILES,
  chooseAlbumCover,
  createAlbumFolder,
  editAlbumMetadata,
  editTracksMetadata,
  moveTracksToTargetAlbum,
  removeDownloads,
} from "@/scripts/offlineFiles";
import { askChoice } from "@/scripts/askChoice";
import { showError } from "@/scripts/showError";
import {
  AlbumFormModal,
  MoveToAlbumModal,
  TrackEditModal,
} from "@/components/DownloadEditModals";
import LoadingScreen from "@/components/LoadingScreen";
import DropletSpinner from "@/components/DropletSpinner";
import OfflineNotice from "@/components/OfflineNotice";
import { openMainTab } from "@/components/Footer";
import { isNetworkError } from "@/scripts/networkError";

type DateTimeFormatOptions = Intl.DateTimeFormatOptions;

function AlbumPlayButton({ playableTracks }: { playableTracks: RNTrack[] }) {
  const { isPlaying, activeTrack, playTrack, togglePlayPause } = usePlayer("isPlaying", "activeTrack", "playTrack", "togglePlayPause");

  const isCurrentAlbum = Boolean(
    activeTrack &&
      playableTracks.length > 0 &&
      ((activeTrack.trackGroup?.urlSlug &&
        activeTrack.trackGroup.urlSlug === playableTracks[0]?.trackGroup?.urlSlug) ||
        playableTracks.some((t) => isSameTrack(activeTrack, t))),
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
  const isSavedRoute = String(slug ?? "").startsWith(SAVED_PREFIX);
  const { isPending, isError, data, error } = useQuery(
    queryAlbum({ slug: slug, id: id }),
  );
  const router = useRouter();
  const { disabledTrackIds } = usePlayer("disabledTrackIds");
  const downloads = useDownloads();

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingAlbumModal, setEditingAlbumModal] = useState(false);
  const [editingTracksIds, setEditingTracksIds] = useState<number[] | null>(null);
  const [movingTracksIds, setMovingTracksIds] = useState<number[] | null>(null);
  const [activeSavedKey, setActiveSavedKey] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const runTrackAction = async (action: () => Promise<unknown>, errorMsg: string) => {
    setIsBusy(true);
    try {
      await action();
    } catch (err) {
      showError(errorMsg)(err);
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    setActiveSavedKey(null);
  }, [slug]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const savedAlbums = useMemo(() => groupTracksIntoAlbums(downloads), [downloads]);
  const matchedSavedAlbum = useMemo(() => {
    if (activeSavedKey) {
      const byActiveKey = savedAlbums.find((a) => a.key === activeSavedKey);
      if (byActiveKey) return byActiveKey;
    }
    const slugStr = slug ? String(slug) : "";
    const target = slugStr ? nameKey(slugStr) : "";
    const online = data?.result;
    return savedAlbums.find(
      (a) =>
        (target && nameKey(a.title) === target) ||
        (slugStr && savedAlbumSlug(a.key) === slugStr) ||
        (slugStr && a.tracks.some((t) => String(t.id) === slugStr)) ||
        (online &&
          sameAlbum(
            { title: a.title, artist: a.artist },
            { title: online.title, artist: online.artist?.name },
          )),
    );
  }, [savedAlbums, slug, data?.result, activeSavedKey]);

  // For saved albums, derive the page reactively from downloads so renames and moves update live;
  // for online albums with local downloads, merge the downloaded tracks (including extra/duplicate tracks)
  const resolvedAlbum: AlbumProps | undefined = useMemo(() => {
    if (isSavedRoute && matchedSavedAlbum) {
      return savedAlbumPage(matchedSavedAlbum);
    }
    if (data?.result) {
      return downloads.length > 0 || matchedSavedAlbum
        ? mergeAlbumWithDownloads(data.result, matchedSavedAlbum, downloads)
        : data.result;
    }
    return matchedSavedAlbum ? savedAlbumPage(matchedSavedAlbum) : undefined;
  }, [isSavedRoute, matchedSavedAlbum, data?.result, downloads]);

  useEffect(() => {
    if (!resolvedAlbum) return;
    const coverUri =
      resolvedAlbum.cover?.sizes?.[300] ||
      resolvedAlbum.cover?.sizes?.[600] ||
      resolvedAlbum.cover?.sizes?.[120];
    const savedAlbum = (resolvedAlbum.tracks?.[0] as RNTrack | undefined)?.downloadAlbum;
    recordHistoryItem(
      resolvedAlbum.source === SAVED_SOURCE && savedAlbum
        ? {
            downloadAlbum: savedAlbum,
            title: resolvedAlbum.title,
            artistName: resolvedAlbum.artist?.name || "",
            coverUri,
          }
        : {
            id: resolvedAlbum.id,
            artistId: resolvedAlbum.artistId,
            urlSlug: resolvedAlbum.urlSlug,
            title: resolvedAlbum.title,
            artistName: resolvedAlbum.artist?.name || "",
            coverUri,
          },
    );
  }, [resolvedAlbum]);

  const { allTracks: album, playableTracks } = useMemo(() => {
    const tracksToPlay: RNTrack[] = [];
    const allTracks: RNTrack[] = [];
    let playableIndex = 0;

    if (resolvedAlbum) {
      const fallbackAlbumSource =
        resolvedAlbum.source ||
        resolveFeedSourceName(
          resolvedAlbum.tracks?.[0]?.url || resolvedAlbum.tracks?.[0]?.audio?.url,
        );
      resolvedAlbum.source = fallbackAlbumSource;

      const resolvedAlbumId = resolvedAlbum.id || resolvedAlbum.trackGroupId;

      resolvedAlbum.tracks?.forEach((track) => {
        const rawAudioUrl = track.audio?.url || track.url || "";
        const streamUrl = /^(https?|file|content):\/|^blob:/.test(rawAudioUrl)
          ? rawAudioUrl
          : `${API_ROOT}${rawAudioUrl.startsWith("/") ? "" : "/"}${rawAudioUrl}`;
        const trackSource =
          track.source ||
          resolvedAlbum.source ||
          (streamUrl.startsWith("http")
            ? resolveFeedSourceName(streamUrl)
            : "Mirlo Space");
        const trackSourceUrl = track.sourceUrl || resolvedAlbum.sourceUrl;
        const trackAlbumId = resolvedAlbumId || track.trackGroupId;

        const newTrack: RNTrack = {
          title: track.title || resolvedAlbum.title || `Track ${track.order ?? 1}`,
          artist: track.artist || resolvedAlbum.artist?.name || "",
          artwork: resolvedAlbum.cover?.sizes?.[600] || resolvedAlbum.cover?.sizes?.[300],
          url: streamUrl,
          allowIndividualSale: track.allowIndividualSale,
          id: track.id,
          trackArtists: track.trackArtists,
          queueIndex: track.order,
          trackGroupId: trackAlbumId,
          trackGroup: {
            userTrackGroupPurchases: resolvedAlbum.userTrackGroupPurchases,
            artistId: resolvedAlbum.artistId,
            urlSlug: resolvedAlbum.urlSlug,
            cover: resolvedAlbum.cover,
            title: resolvedAlbum.title,
            artist: resolvedAlbum.artist,
            id: resolvedAlbum.id,
            releaseDate: resolvedAlbum.releaseDate,
            trackGroupId: trackAlbumId,
            source: trackSource,
            sourceUrl: trackSourceUrl,
            purchaseLinks: resolvedAlbum.purchaseLinks,
          },
          audio: {
            url: streamUrl,
            duration: track.audio?.duration ?? track.duration,
          },
          duration: track.audio?.duration ?? track.duration,
          isPreview: track.isPreview,
          order: track.order,
          headers: track.headers || {
            "mirlo-api-key": API_KEY,
          },
          type: audioTrackType(streamUrl),
          source: trackSource,
          sourceUrl: trackSourceUrl,
          fairplayerTrackId: track.fairplayerTrackId,
          downloadAlbum: track.downloadAlbum,
        };

        allTracks.push(newTrack);

        if (isTrackOwnedOrPreview(newTrack, null, resolvedAlbum, disabledTrackIds)) {
          newTrack.queueIndex = playableIndex;
          playableIndex++;
          tracksToPlay.push(newTrack);
        }
      });
    }

    return { allTracks, playableTracks: tracksToPlay };
  }, [resolvedAlbum, disabledTrackIds]);

  const savedTracksById = useMemo(() => {
    const map = new Map<number, (typeof downloads)[number]>();
    for (const d of downloads) map.set(d.id, d);
    return map;
  }, [downloads]);

  const downloadedTrackIdsOnPage = useMemo(
    () => album.filter((t) => savedTracksById.has(t.id)).map((t) => t.id),
    [album, savedTracksById],
  );

  // Prune any selected IDs that are no longer on this album page
  useEffect(() => {
    const valid = new Set(downloadedTrackIdsOnPage);
    setSelectedIds((prev) => {
      const next = prev.filter((id) => valid.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [downloadedTrackIdsOnPage]);

  // Automatically adopt any loose downloaded tracks paired on this album page into the album's
  // universal schema (albumTitle and artist) so they stay unified in Downloads and on disk
  useEffect(() => {
    if (!resolvedAlbum || downloadedTrackIdsOnPage.length === 0) return;
    const targetTitle = (resolvedAlbum.title || "").trim();
    const targetArtist = (resolvedAlbum.artist?.name || "").trim();
    if (!targetTitle || !targetArtist) return;
    const outOfSyncIds = downloadedTrackIdsOnPage.filter((trackId) => {
      const st = savedTracksById.get(trackId);
      if (!st) return false;
      return (
        (st.albumTitle || "").trim() !== targetTitle ||
        (st.artist || "").trim() !== targetArtist
      );
    });
    if (outOfSyncIds.length > 0) {
      const targetKey = matchedSavedAlbum?.key ?? albumTitleKey(targetTitle);
      editAlbumMetadata(
        targetKey,
        {
          albumTitle: targetTitle,
          artist: targetArtist,
        },
        outOfSyncIds,
      ).catch(() => {});
    }
  }, [resolvedAlbum, matchedSavedAlbum, downloadedTrackIdsOnPage, savedTracksById]);

  if (isPending && !resolvedAlbum) {
    return <LoadingScreen />;
  }

  if (isError && !resolvedAlbum) {
    return (
      <OfflineNotice
        title={isNetworkError(error) ? "You're Offline" : "Can't Load Album"}
        message={
          isNetworkError(error)
            ? "Can't reach Mirlo right now. Your downloaded music still plays."
            : error instanceof Error
            ? error.message
            : "Something went wrong loading this album."
        }
        onDismiss={handleBack}
        onOpenLibrary={() => openMainTab("library")}
      />
    );
  }

  if (!resolvedAlbum) {
    return <LoadingScreen />;
  }

  const selectedAlbum = resolvedAlbum;
  const isSavedPage = selectedAlbum.source === SAVED_SOURCE;
  const onDevice = isSavedPage || downloadedAlbumMatcher(downloads)(selectedAlbum);
  const canManageTracks = isSavedPage || downloadedTrackIdsOnPage.length > 0;
  const albumSource =
    selectedAlbum?.source ||
    selectedAlbum?.tracks?.[0]?.source ||
    resolveFeedSourceName(selectedAlbum?.tracks?.[0]?.url || selectedAlbum?.tracks?.[0]?.audio?.url);

  const toggleSelectTrack = (trackId: number) => {
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedIds([trackId]);
      return;
    }
    setSelectedIds((prev) =>
      prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId],
    );
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const confirmDeleteTracks = (ids: number[]) => {
    const toRemove = ids
      .map((id) => savedTracksById.get(id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    if (toRemove.length === 0) return;
    const count = toRemove.length;
    askChoice(
      count === 1 ? "Delete Track?" : `Delete ${count} Tracks?`,
      count === 1
        ? `Remove "${toRemove[0].title}" from your downloads?`
        : `Remove ${count} tracks from your downloads?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void runTrackAction(async () => {
              await removeDownloads(toRemove);
              if (selectionMode) exitSelectionMode();
            }, "Couldn't delete tracks");
          },
        },
      ],
    );
  };

  const openTrackMenu = (track: RNTrack) => {
    const saved = savedTracksById.get(track.id);
    if (!saved) return;
    askChoice(saved.title || track.title, saved.artist || track.artist, [
      {
        text: "Rename Track",
        onPress: () => setEditingTracksIds([track.id]),
      },
      {
        text: "Move to Album",
        onPress: () => setMovingTracksIds([track.id]),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => confirmDeleteTracks([track.id]),
      },
      ...(Platform.OS === "ios" ? [{ text: "Cancel", style: "cancel" as const }] : []),
    ]);
  };

  const openAlbumMenu = () => {
    if (!matchedSavedAlbum) return;
    askChoice(matchedSavedAlbum.title, matchedSavedAlbum.artist, [
      {
        text: "Rename Album",
        onPress: () => setEditingAlbumModal(true),
      },
      ...(PICKS_PHONE_FILES
        ? [
            {
              text: "Change Cover",
              onPress: () =>
                void runTrackAction(
                  () => chooseAlbumCover(matchedSavedAlbum),
                  "Couldn't set cover",
                ),
            },
          ]
        : []),
      ...(Platform.OS === "ios" ? [{ text: "Cancel", style: "cancel" as const }] : []),
    ]);
  };

  const singleEditingTrack =
    editingTracksIds?.length === 1 ? savedTracksById.get(editingTracksIds[0]) : undefined;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.topNav}>
        <Pressable
          onPress={selectionMode ? exitSelectionMode : handleBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={selectionMode ? "Done selecting" : "Back"}
        >
          <Ionicons
            name={selectionMode ? "close" : "chevron-back"}
            size={24}
            color={theme.colors.textPrimary}
          />
        </Pressable>

        {selectionMode ? (
          <View style={styles.selectionTopBar}>
            <Text style={styles.selectionCountText}>
              {selectedIds.length} selected
            </Text>
            <View style={styles.topNavRight}>
              <TouchableOpacity
                onPress={() =>
                  setSelectedIds(
                    selectedIds.length === downloadedTrackIdsOnPage.length
                      ? []
                      : [...downloadedTrackIdsOnPage],
                  )
                }
                style={styles.navPillBtn}
                accessibilityRole="button"
              >
                <Text style={styles.navPillText}>
                  {selectedIds.length === downloadedTrackIdsOnPage.length
                    ? "Deselect All"
                    : "Select All"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={exitSelectionMode}
                style={[styles.navPillBtn, styles.navPillPrimary]}
                accessibilityRole="button"
              >
                <Text style={styles.navPillPrimaryText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.topNavRight}>
            {matchedSavedAlbum && (
              <Pressable
                onPress={openAlbumMenu}
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel="Album options"
              >
                <Ionicons
                  name="ellipsis-vertical"
                  size={20}
                  color={theme.colors.textPrimary}
                />
              </Pressable>
            )}
          </View>
        )}
      </View>

      {selectionMode && (
        <View style={styles.bulkBar}>
          {selectedIds.length === 1 && (
            <TouchableOpacity
              onPress={() => setEditingTracksIds([...selectedIds])}
              style={styles.bulkActionBtn}
              accessibilityRole="button"
            >
              <Ionicons name="create-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.bulkActionText}>Rename</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            disabled={selectedIds.length === 0}
            onPress={() => setMovingTracksIds([...selectedIds])}
            style={[styles.bulkActionBtn, selectedIds.length === 0 && styles.bulkDisabled]}
            accessibilityRole="button"
          >
            <Ionicons name="folder-open-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.bulkActionText}>Move to Album</Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={selectedIds.length === 0}
            onPress={() => confirmDeleteTracks([...selectedIds])}
            style={[
              styles.bulkActionBtn,
              styles.bulkDangerBtn,
              selectedIds.length === 0 && styles.bulkDisabled,
            ]}
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
            <Text style={styles.bulkDangerText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

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
                selectionMode={selectionMode && savedTracksById.has(item.id)}
                isSelected={selectedIds.includes(item.id)}
                onToggleSelect={
                  savedTracksById.has(item.id)
                    ? () => toggleSelectTrack(item.id)
                    : undefined
                }
                onTrackMenu={
                  canManageTracks && savedTracksById.has(item.id)
                    ? () => openTrackMenu(item)
                    : undefined
                }
              />
            ) : null
          }
          ListEmptyComponent={
            isSavedPage ? (
              <View style={styles.emptyAlbumBox}>
                <Ionicons name="musical-notes-outline" size={32} color={theme.colors.textMuted} />
                <Text style={styles.emptyAlbumText}>
                  No tracks in this album yet. Open another downloaded album and use Move to Album to add tracks here.
                </Text>
              </View>
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
                    <Text style={styles.byText}>{"by "}</Text>
                    <Pressable
                      onPress={() =>
                        router.push({
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
                      {!onDevice && <AddAlbumButton trackGroup={selectedAlbum} size={36} />}
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
              <Text style={styles.aboutHeader}>About</Text>
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

      <AlbumFormModal
        visible={editingAlbumModal}
        mode="edit"
        initialTitle={matchedSavedAlbum?.title ?? selectedAlbum.title}
        initialArtist={matchedSavedAlbum?.artist ?? selectedAlbum.artist.name}
        onClose={() => setEditingAlbumModal(false)}
        onSubmit={(newTitle, newArtist) => {
          const sourceKey = matchedSavedAlbum?.key ?? albumTitleKey(selectedAlbum.title);
          void runTrackAction(async () => {
            setActiveSavedKey(albumTitleKey(newTitle));
            const nextKey = await editAlbumMetadata(
              sourceKey,
              {
                albumTitle: newTitle,
                artist: newArtist,
              },
              downloadedTrackIdsOnPage,
            );
            setActiveSavedKey(nextKey);
            const stillMatchesOnline =
              !isSavedRoute &&
              data?.result &&
              sameAlbum(
                { title: newTitle, artist: newArtist },
                { title: data.result.title, artist: data.result.artist?.name },
              );
            const targetId = savedArtistSlug(newArtist);
            const targetSlug = savedAlbumSlug(nextKey);
            if (
              (isSavedRoute || !stillMatchesOnline) &&
              (String(id) !== targetId || String(slug) !== targetSlug)
            ) {
              router.replace({
                pathname: "/artist/[id]/album/[slug]/album-tracks",
                params: {
                  id: targetId,
                  slug: targetSlug,
                },
              });
            }
          }, "Couldn't rename album");
        }}
      />

      <TrackEditModal
        visible={editingTracksIds !== null}
        initialTitle={singleEditingTrack?.title ?? ""}
        initialOrder={singleEditingTrack?.order}
        onClose={() => setEditingTracksIds(null)}
        onSubmit={(changes) => {
          if (!editingTracksIds) return;
          const ids = [...editingTracksIds];
          void runTrackAction(async () => {
            await editTracksMetadata(ids, changes);
            if (selectionMode) exitSelectionMode();
          }, "Couldn't update track");
        }}
      />

      <MoveToAlbumModal
        visible={movingTracksIds !== null}
        albums={savedAlbums}
        currentAlbumKey={matchedSavedAlbum?.key}
        trackCount={movingTracksIds?.length ?? 0}
        defaultArtist={selectedAlbum.artist?.name ?? ""}
        onClose={() => setMovingTracksIds(null)}
        onSelectAlbum={(target) => {
          if (!movingTracksIds) return;
          const ids = [...movingTracksIds];
          void runTrackAction(async () => {
            if (target.isNew) {
              await createAlbumFolder(target.title, target.artist);
            }
            await moveTracksToTargetAlbum(ids, target);
            if (selectionMode) exitSelectionMode();
          }, "Couldn't move tracks");
        }}
      />

      {isBusy && (
        <View style={styles.busyOverlay} pointerEvents="auto">
          <DropletSpinner size={52} color={theme.colors.primary} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 52,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceCardBorder,
  },
  backBtn: {
    padding: 6,
  },
  topNavRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectionTopBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginLeft: 8,
  },
  selectionCountText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  navPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  navPillText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  navPillPrimary: {
    backgroundColor: theme.colors.primary,
  },
  navPillPrimaryText: {
    color: theme.colors.playButtonIcon,
    fontSize: 12,
    fontWeight: "700",
  },
  bulkBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceGlassBorder,
  },
  bulkActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
  },
  bulkDangerBtn: {
    borderColor: theme.colors.danger,
  },
  bulkDisabled: {
    opacity: 0.45,
  },
  bulkActionText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  bulkDangerText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: "700",
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
  emptyAlbumBox: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyAlbumText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
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
