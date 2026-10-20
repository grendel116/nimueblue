import { Pressable, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";
import { openInBrowser } from "@/scripts/openInBrowser";
import { releasePageUrl } from "@/scripts/hostLinks";

type AddAlbumButtonProps = {
  trackGroup: AlbumProps;
  style?: ViewStyle;
  size?: number;
};

// Opens the release's page on its host, where the listener buys or downloads it
export default function AddAlbumButton({ style, size = 32, trackGroup }: AddAlbumButtonProps) {
  const url = releasePageUrl(trackGroup);
  if (!url) return null;

  return (
    <Pressable
      onPress={() => openInBrowser(url)}
      style={style}
      accessibilityRole="button"
      accessibilityLabel="Buy or download"
    >
      <Ionicons name="bag-handle-outline" size={size} color={theme.colors.iconIdle} />
    </Pressable>
  );
}
