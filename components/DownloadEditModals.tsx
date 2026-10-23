import { useEffect, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, ModalShell } from "@/components/ui";
import { theme } from "@/constants/theme";
import { DownloadedAlbum } from "@/scripts/downloadManager";

export function AlbumFormModal({
  visible,
  mode,
  initialTitle = "",
  initialArtist = "",
  onClose,
  onSubmit,
}: {
  visible: boolean;
  mode: "create" | "edit";
  initialTitle?: string;
  initialArtist?: string;
  onClose: () => void;
  onSubmit: (title: string, artist: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [artist, setArtist] = useState(initialArtist);

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setArtist(initialArtist);
    }
  }, [visible, initialTitle, initialArtist]);

  const handleSave = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    onSubmit(cleanTitle, artist.trim() || "Unknown Artist");
    onClose();
  };

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title={mode === "create" ? "Create Album" : "Edit Album"}
      message={
        mode === "create"
          ? "Tracks moved to this album inherit its album and artist name."
          : "Update the album and artist name for all songs in this album."
      }
    >
      <View style={styles.form}>
        <Text style={styles.label}>Album Name</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Album title"
          placeholderTextColor={theme.colors.textMuted}
          autoFocus
          returnKeyType="next"
        />
        <Text style={styles.label}>Artist Name</Text>
        <TextInput
          style={styles.input}
          value={artist}
          onChangeText={setArtist}
          placeholder="Artist name"
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
        <View style={styles.actions}>
          <Button
            label="Cancel"
            variant="secondary"
            onPress={onClose}
            style={styles.actionBtn}
          />
          <Button
            label={mode === "create" ? "Create" : "Save"}
            variant="primary"
            disabled={!title.trim()}
            onPress={handleSave}
            style={styles.actionBtn}
          />
        </View>
      </View>
    </ModalShell>
  );
}

export function TrackEditModal({
  visible,
  initialTitle = "",
  initialOrder,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  initialTitle?: string;
  initialOrder?: number;
  onClose: () => void;
  onSubmit: (changes: { title?: string; order?: number }) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [orderText, setOrderText] = useState(initialOrder ? String(initialOrder) : "");

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setOrderText(initialOrder ? String(initialOrder) : "");
    }
  }, [visible, initialTitle, initialOrder]);

  const handleSave = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const changes: { title?: string; order?: number } = { title: cleanTitle };
    const parsedOrder = parseInt(orderText, 10);
    if (Number.isFinite(parsedOrder) && parsedOrder > 0) {
      changes.order = parsedOrder;
    }
    onSubmit(changes);
    onClose();
  };

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title="Rename Track"
      message="Update the track's title or track number."
    >
      <View style={styles.form}>
        <Text style={styles.label}>Track Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Track title"
          placeholderTextColor={theme.colors.textMuted}
          autoFocus
          returnKeyType="next"
        />
        <Text style={styles.label}>Track Number</Text>
        <TextInput
          style={styles.input}
          value={orderText}
          onChangeText={setOrderText}
          placeholder="1"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
        <View style={styles.actions}>
          <Button
            label="Cancel"
            variant="secondary"
            onPress={onClose}
            style={styles.actionBtn}
          />
          <Button
            label="Save"
            variant="primary"
            disabled={!title.trim()}
            onPress={handleSave}
            style={styles.actionBtn}
          />
        </View>
      </View>
    </ModalShell>
  );
}

export function MoveToAlbumModal({
  visible,
  albums,
  currentAlbumKey,
  trackCount,
  defaultArtist = "",
  onClose,
  onSelectAlbum,
}: {
  visible: boolean;
  albums: DownloadedAlbum[];
  currentAlbumKey?: string;
  trackCount: number;
  defaultArtist?: string;
  onClose: () => void;
  onSelectAlbum: (target: { title: string; artist: string; artwork?: string; isNew?: boolean }) => void;
}) {
  const [creatingNew, setCreatingNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newArtist, setNewArtist] = useState(defaultArtist);

  const otherAlbums = albums.filter((a) => a.key !== currentAlbumKey);

  useEffect(() => {
    if (visible) {
      setCreatingNew(otherAlbums.length === 0);
      setNewTitle("");
      setNewArtist(defaultArtist);
    }
  }, [visible, otherAlbums.length, defaultArtist]);

  const handleCreateAndMove = () => {
    const cleanTitle = newTitle.trim();
    if (!cleanTitle) return;
    onSelectAlbum({
      title: cleanTitle,
      artist: newArtist.trim() || defaultArtist.trim() || "Unknown Artist",
      isNew: true,
    });
    onClose();
  };

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title={`Move ${trackCount} ${trackCount === 1 ? "Track" : "Tracks"}`}
      message="Tracks inherit the album and artist name of the destination album."
    >
      {creatingNew ? (
        <View style={styles.form}>
          <Text style={styles.label}>New Album Name</Text>
          <TextInput
            style={styles.input}
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="Album title"
            placeholderTextColor={theme.colors.textMuted}
            autoFocus
            returnKeyType="next"
          />
          <Text style={styles.label}>Artist Name</Text>
          <TextInput
            style={styles.input}
            value={newArtist}
            onChangeText={setNewArtist}
            placeholder="Artist name"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={handleCreateAndMove}
          />
          <View style={styles.actions}>
            <Button
              label={otherAlbums.length > 0 ? "Back" : "Cancel"}
              variant="secondary"
              onPress={() => (otherAlbums.length > 0 ? setCreatingNew(false) : onClose())}
              style={styles.actionBtn}
            />
            <Button
              label="Create & Move"
              variant="primary"
              disabled={!newTitle.trim()}
              onPress={handleCreateAndMove}
              style={styles.actionBtn}
            />
          </View>
        </View>
      ) : (
        <View style={styles.pickerContainer}>
          <Pressable
            onPress={() => setCreatingNew(true)}
            style={({ pressed }) => [styles.newAlbumRow, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel="Create new album"
          >
            <View style={[styles.albumThumb, styles.newAlbumIcon]}>
              <Ionicons name="add" size={20} color={theme.colors.playButtonIcon} />
            </View>
            <View style={styles.albumInfo}>
              <Text style={styles.newAlbumText}>New Album...</Text>
              <Text style={styles.albumSub}>Create a new album and move here</Text>
            </View>
          </Pressable>

          <FlatList
            data={otherAlbums}
            keyExtractor={(a) => a.key}
            style={styles.albumList}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelectAlbum({
                    title: item.title,
                    artist: item.artist,
                    artwork: item.artwork,
                  });
                  onClose();
                }}
                style={({ pressed }) => [styles.albumRow, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Move to ${item.title} by ${item.artist}`}
              >
                {item.artwork ? (
                  <Image source={{ uri: item.artwork }} style={styles.albumThumb} />
                ) : (
                  <View style={[styles.albumThumb, styles.placeholderThumb]}>
                    <Ionicons name="musical-notes" size={16} color={theme.colors.primary} />
                  </View>
                )}
                <View style={styles.albumInfo}>
                  <Text style={styles.albumTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.albumArtist} numberOfLines={1}>
                    {item.artist} • {item.tracks.length}{" "}
                    {item.tracks.length === 1 ? "song" : "songs"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
              </Pressable>
            )}
          />

          <Button
            label="Cancel"
            variant="secondary"
            onPress={onClose}
            fullWidth
            style={{ marginTop: 8 }}
          />
        </View>
      )}
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  form: {
    marginTop: 14,
    gap: 8,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.textPrimary,
    fontSize: 14,
    outlineStyle: "none" as any,
    outlineWidth: 0 as any,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
  },
  pickerContainer: {
    marginTop: 14,
    gap: 6,
  },
  albumList: {
    maxHeight: 260,
  },
  newAlbumRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    marginBottom: 4,
  },
  albumRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    marginBottom: 6,
  },
  rowPressed: {
    opacity: 0.75,
  },
  albumThumb: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceElevated,
  },
  newAlbumIcon: {
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderThumb: {
    justifyContent: "center",
    alignItems: "center",
  },
  albumInfo: {
    flex: 1,
    marginLeft: 10,
  },
  newAlbumText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  albumSub: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  albumTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  albumArtist: {
    color: theme.colors.textCyan,
    fontSize: 12,
    marginTop: 1,
  },
});
