import { memo, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { showError } from "@/scripts/showError";
import { askChoice } from "@/scripts/askChoice";
import { theme } from "@/constants/theme";
import { DownloadedAlbum, groupTracksIntoAlbums, useDownloads } from "@/scripts/downloadManager";
import { openDownloadedAlbum } from "@/scripts/albumLookup";
import { PICKS_PHONE_FILES, chooseAlbumCover, removeDownloads } from "@/scripts/offlineFiles";
import {
  chooseMusicFolder,
  MusicFolderStatus,
  reconnectMusicFolder,
  rescanMusicFolder,
  useMusicFolder,
} from "@/scripts/musicFolder";

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}

// What an empty Downloads tab suggests in each music folder state
function emptyText(folder: MusicFolderStatus): string {
  switch (folder) {
    case "ready":
      return "Tap the download arrow on an album you own, or add songs to your music folder and pull down to scan it.";
    case "needs-permission":
      return "Reconnect your music folder to play the songs saved in it.";
    case "none":
      return "Choose your music folder. The songs already in it show here, and you can pull down to scan it any time.";
    case "unsupported":
      return "Offline music folders require a Chromium browser (such as Chrome, Edge, or Brave) or the Android app.";
  }
}

function confirmDeleteAlbum(album: DownloadedAlbum) {
  const count = album.tracks.length;
  askChoice(
    "Delete album?",
    `Remove "${album.title}" and its ${count} ${count === 1 ? "song" : "songs"} from your downloads?`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => removeDownloads(album.tracks).catch(showError("Couldn't delete album")),
      },
    ],
  );
}

// Everything saved on this phone, one row per album like the other Library boxes. Tapping an
// album opens its page; holding it offers the cover and delete
export default memo(function DownloadsTab() {
  const tracks = useDownloads();
  const albums = useMemo(() => groupTracksIntoAlbums(tracks), [tracks]);
  const musicFolder = useMusicFolder();
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const open = async (album: DownloadedAlbum) => {
    setOpeningKey(album.key);
    try {
      await openDownloadedAlbum(album.key);
    } finally {
      setOpeningKey(null);
    }
  };

  const showTools = (album: DownloadedAlbum) =>
    askChoice(album.title, undefined, [
      ...(PICKS_PHONE_FILES
        ? [
            {
              text: "Change cover",
              onPress: () => chooseAlbumCover(album).catch(showError("Couldn't set cover")),
            },
          ]
        : []),
      { text: "Delete", style: "destructive", onPress: () => confirmDeleteAlbum(album) },
      // Android shows three buttons at most and closes on a tap outside instead
      ...(Platform.OS === "ios" ? [{ text: "Cancel", style: "cancel" as const }] : []),
    ]);

  const runMusicFolder = async (action: () => Promise<unknown>) => {
    setImporting(true);
    try {
      await action();
    } catch (err) {
      showError("Couldn't open your music folder")(err);
    } finally {
      setImporting(false);
    }
  };

  const refreshControl =
    musicFolder.status === "ready" ? (
      <RefreshControl
        refreshing={importing}
        onRefresh={() => runMusicFolder(rescanMusicFolder)}
        tintColor={theme.colors.primary}
        colors={[theme.colors.primary]}
        progressBackgroundColor={theme.colors.surfaceElevated}
      />
    ) : undefined;

  return (
    <View style={styles.pane}>
      <View style={styles.bar}>
        <Text style={styles.total}>
          {albums.length > 0
            ? `${albums.length} ${albums.length === 1 ? "album" : "albums"} • ${formatBytes(
                tracks.reduce((sum, t) => sum + (t.bytes || 0), 0),
              )}`
            : ""}
        </Text>
        {musicFolder.status !== "unsupported" && (
          <View style={styles.barActions}>
            {importing && <ActivityIndicator size="small" color={theme.colors.primary} />}
            {musicFolder.status === "ready" ? (
              <>
                {Platform.OS === "web" && (
                  <TouchableOpacity
                    onPress={() => runMusicFolder(rescanMusicFolder)}
                    disabled={importing}
                    style={styles.folderButton}
                    accessibilityLabel="Look for new and removed songs in your music folder"
                  >
                    <Ionicons name="refresh" size={14} color={theme.colors.primary} />
                    <Text style={styles.folderButtonText}>Rescan</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => runMusicFolder(chooseMusicFolder)}
                  disabled={importing}
                  style={styles.folderButton}
                >
                  <Ionicons name="folder-open-outline" size={14} color={theme.colors.primary} />
                  <Text style={styles.folderButtonText}>Change folder</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={() =>
                  runMusicFolder(
                    musicFolder.status === "needs-permission" ? reconnectMusicFolder : chooseMusicFolder,
                  )
                }
                disabled={importing}
                style={styles.addButton}
              >
                <Ionicons name="folder-open-outline" size={14} color={theme.colors.playButtonIcon} />
                <Text style={styles.addButtonText}>
                  {musicFolder.status === "needs-permission" ? "Reconnect music folder" : "Choose music folder"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {albums.length === 0 ? (
        <ScrollView contentContainerStyle={styles.empty} refreshControl={refreshControl}>
          <Ionicons name="download-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>No downloads yet</Text>
          <Text style={styles.emptyText}>{emptyText(musicFolder.status)}</Text>
        </ScrollView>
      ) : (
        <FlatList
          data={albums}
          refreshControl={refreshControl}
          keyExtractor={(album) => album.key}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
          contentContainerStyle={styles.list}
          renderItem={({ item: album }) => (
            <View style={styles.card}>
              <Pressable
                android_ripple={{ color: theme.colors.ripple }}
                onPress={() => open(album)}
                onLongPress={() => showTools(album)}
                disabled={openingKey !== null}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
                accessibilityHint="Hold for cover and delete"
              >
                {album.artwork ? (
                  <Image source={{ uri: album.artwork }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.placeholder]}>
                    <Ionicons name="musical-notes" size={20} color={theme.colors.primary} />
                  </View>
                )}
                <View style={styles.info}>
                  <Text style={styles.title} numberOfLines={1}>
                    {album.title}
                  </Text>
                  <Text style={styles.artist} numberOfLines={1}>
                    {album.artist}
                  </Text>
                  <Text style={styles.meta}>
                    {album.tracks.length} {album.tracks.length === 1 ? "song" : "songs"} •{" "}
                    {formatBytes(album.totalBytes)}
                  </Text>
                </View>
                {openingKey === album.key ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                )}
              </Pressable>

            </View>
          )}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  pane: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  total: { color: theme.colors.textSecondary, fontSize: 12 },
  barActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
  },
  addButtonText: { color: theme.colors.playButtonIcon, fontSize: 12, fontWeight: "700" },
  folderButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  folderButtonText: { color: theme.colors.primary, fontSize: 12, fontWeight: "700" },
  empty: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 10 },
  emptyTitle: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: "700" },
  emptyText: { color: theme.colors.textSecondary, fontSize: 13, textAlign: "center" },
  list: { padding: 12, paddingBottom: 80 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
  },
  row: { flexDirection: "row", alignItems: "center" },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceElevated,
  },
  placeholder: { justifyContent: "center", alignItems: "center" },
  info: { flex: 1, marginLeft: 12 },
  title: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: "600" },
  artist: { color: theme.colors.textCyan, fontSize: 12, marginTop: 2 },
  meta: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 2 },
});
