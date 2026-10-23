import { useState } from "react";
import { ActivityIndicator, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";
import { findDownload, useDownloads } from "@/scripts/downloadManager";
import { CAN_DOWNLOAD, removeDownloads } from "@/scripts/offlineFiles";
import { showError } from "@/scripts/showError";

// Removes a song saved on the device
export default function DownloadTrackButton({
  track,
  album,
  size = 17,
}: {
  track: RNTrack;
  album: AlbumProps;
  size?: number;
}) {
  const downloads = useDownloads();
  const saved =
    downloads.find((d) => d.id === track.id) ??
    findDownload({ ...track, trackGroup: album });
  const [busy, setBusy] = useState(false);

  if (!CAN_DOWNLOAD || !saved) return null;

  const onPress = () => {
    if (busy) return;
    setBusy(true);
    removeDownloads([saved])
      .catch(showError("Couldn't remove song"))
      .finally(() => setBusy(false));
  };

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Remove ${track.title} download`}
    >
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.primary} />
      ) : (
        <Ionicons
          name="checkmark-circle"
          size={size}
          color={theme.colors.primary}
        />
      )}
    </Pressable>
  );
}