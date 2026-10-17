import { useRouter } from "expo-router";
import { Pressable, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback } from "react";
import { fairplayerReleaseSlug } from "@/queries/fairplayer";
import { openPurchase } from "@/scripts/openPurchase";
import { faircampAction } from "@/components/purchase/helpers";

type AddAlbumButtonProps = {
  trackGroup: AlbumProps;
  style?: ViewStyle;
  size?: number;
};

// Opens the purchase sheet for this release
export default function AddAlbumButton({ style, size = 32, trackGroup }: AddAlbumButtonProps) {
  const router = useRouter();
  const faircamp = faircampAction(trackGroup);

  const onPress = useCallback(() => {
    openPurchase(router, {
      kind: "album",
      artist:
        fairplayerReleaseSlug.artistRouteId(trackGroup.urlSlug) ??
        String(trackGroup.artist?.urlSlug || trackGroup.artistId),
      slug: trackGroup.urlSlug,
    });
  }, [trackGroup, router]);

  return faircamp === "download" || faircamp === "none" ? null : (
    <Pressable
      onPress={onPress}
      style={style}
      accessibilityRole="button"
      accessibilityLabel="Purchase album"
    >
      <Ionicons name="bag-handle-outline" size={size} color="#ababab" />
    </Pressable>
  );
}
