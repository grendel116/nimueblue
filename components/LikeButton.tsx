import { Pressable, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";

type LikeButtonProps = {
  liked: boolean;
  onPress: () => void;
  // Songs and albums are hearted; radio stations and podcasts are bookmarked
  kind?: "heart" | "bookmark";
  style?: ViewStyle;
  size?: number;
};

export default function LikeButton({ liked, onPress, kind = "heart", style, size }: LikeButtonProps) {
  const bookmark = kind === "bookmark";
  return (
    <Pressable
      onPress={(e) => {
        e?.stopPropagation?.();
        onPress();
      }}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={
        bookmark ? (liked ? "Remove bookmark" : "Bookmark") : liked ? "Unlike" : "Like"
      }
    >
      <Ionicons
        name={liked ? kind : `${kind}-outline`}
        color={liked ? (bookmark ? theme.colors.primary : theme.colors.brandRed) : theme.colors.iconIdle}
        size={size}
      />
    </Pressable>
  );
}
