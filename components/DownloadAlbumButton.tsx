import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";
import {
  DownloadFormat,
  DownloadStage,
  useDownloads,
} from "@/scripts/downloadManager";
import { chooseFormat } from "@/scripts/chooseFormat";
import { showError } from "@/scripts/showError";
import { askChoice } from "@/scripts/askChoice";
import { CAN_DOWNLOAD, downloadAlbum, removeDownloads } from "@/scripts/offlineFiles";
import { chooseFaircampDownload } from "@/scripts/faircampDownload";

const STAGE_LABELS: Record<DownloadStage, string> = {
  preparing: "Preparing",
  downloading: "Downloading",
  unpacking: "Unpacking",
};

// Saves a Faircamp free download album as a zip
export default function DownloadAlbumButton({ album, size = 32 }: { album: AlbumProps; size?: number }) {
  const downloads = useDownloads();
  const [stage, setStage] = useState<DownloadStage | null>(null);
  // Faircamp free downloads offer their zips straight from the album page
  const shop = album.source === "Faircamp" ? album.faircampShop : undefined;
  const faircampDownloads = shop?.mode === "free" ? shop.downloadsUrl : undefined;

  if (!faircampDownloads) return null;

  const saved = downloads.filter((d) => album.tracks?.some((t) => t.id === d.id));
  const isDownloaded = !faircampDownloads && saved.length > 0 && saved.length >= (album.tracks?.length ?? 0);

  const start = (format: DownloadFormat) => {
    setStage("preparing");
    downloadAlbum(album, format, setStage)
      .catch(showError("Download failed"))
      .finally(() => setStage(null));
  };

  const onPress = () => {
    if (stage) return;
    if (faircampDownloads) {
      setStage("preparing");
      chooseFaircampDownload(faircampDownloads)
        .catch(showError("Download failed"))
        .finally(() => setStage(null));
      return;
    }
    if (isDownloaded) {
      askChoice("Remove download?", `${album.title} will only play online.`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeDownloads(saved),
        },
      ]);
      return;
    }
    chooseFormat("Download album", start);
  };

  return (
    <Pressable
      onPress={onPress}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={
        stage ? STAGE_LABELS[stage] : isDownloaded ? "Remove download" : "Download album"
      }
    >
      {stage ? (
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <Ionicons
          name={isDownloaded ? "checkmark-circle" : "arrow-down-circle-outline"}
          size={size}
          color={isDownloaded ? theme.colors.primary : "#ababab"}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
});
