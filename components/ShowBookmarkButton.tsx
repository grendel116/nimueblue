import { ViewStyle } from "react-native";
import LikeButton from "@/components/LikeButton";
import {
  isPodcastShowBookmarked,
  togglePodcastShowBookmark,
  usePodcastEpisodeLikes,
  usePodcastShowBookmarks,
} from "@/scripts/podcastLikes";

type ShowBookmarkButtonProps = {
  show: { id: string; name: string; author: string; artwork: string };
  style?: ViewStyle;
  size?: number;
};

// A podcast show's bookmark, at album level: bookmarking any episode lights it too
export default function ShowBookmarkButton({ show, style, size }: ShowBookmarkButtonProps) {
  const shows = usePodcastShowBookmarks();
  const episodes = usePodcastEpisodeLikes();
  return (
    <LikeButton
      kind="bookmark"
      liked={isPodcastShowBookmarked(show.id, { shows, episodes })}
      onPress={() => togglePodcastShowBookmark(show)}
      style={style}
      size={size}
    />
  );
}
