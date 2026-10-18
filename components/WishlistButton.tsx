import { Pressable, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";
import {
  isFaircampAlbumWishlisted,
  toggleFaircampAlbumWishlist,
  useFaircampSaves,
} from "@/scripts/faircampSaves";

type WishlistButtonProps = {
  trackGroup: {
    id: number;
    trackGroupId?: number;
    source?: string;
    urlSlug?: string;
    tracks?: RNTrack[];
    [key: string]: any;
  };
  displayedTracks?: RNTrack[];
  style?: ViewStyle;
  size?: number;
};

export default function WishlistButton({
  trackGroup,
  displayedTracks,
  style,
  size,
}: WishlistButtonProps) {
  const saves = useFaircampSaves();
  const isInWishlist = isFaircampAlbumWishlisted(trackGroup, saves);
  const tracks =
    displayedTracks && displayedTracks.length > 0
      ? displayedTracks
      : trackGroup.tracks || [];

  return (
    <Pressable
      onPress={() =>
        toggleFaircampAlbumWishlist(trackGroup as AlbumProps, tracks)
      }
      style={style}
      accessibilityRole="button"
      accessibilityLabel={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
    >
      <Ionicons
        name={isInWishlist ? "heart" : "heart-outline"}
        color={isInWishlist ? theme.colors.brandRed : theme.colors.iconIdle}
        size={size}
      />
    </Pressable>
  );
}
