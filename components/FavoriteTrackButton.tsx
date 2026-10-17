import { Pressable, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { toggleStationLike, useStationLikes } from "@/scripts/stationLikes";
import { togglePodcastEpisodeLike, usePodcastEpisodeLikes } from "@/scripts/podcastLikes";
import {
  isFaircampTrackLiked,
  toggleFaircampTrackLike,
  useFaircampSaves,
} from "@/scripts/faircampSaves";

type FavoriteTrackButtonProps = {
  track: RNTrack;
  style?: ViewStyle;
  size?: number;
};

type HeartProps = { liked: boolean; onPress: () => void; style?: ViewStyle; size?: number };

function Heart({ liked, onPress, style, size }: HeartProps) {
  return (
    <Pressable
      onPress={(e) => {
        e?.stopPropagation?.();
        onPress();
      }}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={liked ? "Unlike" : "Like"}
    >
      <Ionicons
        name={liked ? "heart" : "heart-outline"}
        color={liked ? "#BE3455" : "#ababab"}
        size={size}
      />
    </Pressable>
  );
}

// Tracks, radio stations and podcast episodes save their likes locally on the device
export default function FavoriteTrackButton({
  track,
  style,
  size,
}: FavoriteTrackButtonProps) {
  if (track.liveStation) {
    return <StationHeart stationId={track.liveStation} style={style} size={size} />;
  }
  if (track.podcastEpisodeId) {
    return <PodcastEpisodeHeart track={track} style={style} size={size} />;
  }
  if (!track.url && (!track.id || track.id <= 0)) return null;
  return <TrackHeart track={track} style={style} size={size} />;
}

function TrackHeart({
  track,
  style,
  size,
}: {
  track: RNTrack;
  style?: ViewStyle;
  size?: number;
}) {
  useFaircampSaves();
  const liked = isFaircampTrackLiked(track);
  return (
    <Heart
      liked={liked}
      onPress={() => toggleFaircampTrackLike(track)}
      style={style}
      size={size}
    />
  );
}

function StationHeart({
  stationId,
  style,
  size,
}: {
  stationId: string;
  style?: ViewStyle;
  size?: number;
}) {
  const likes = useStationLikes();
  const liked = likes.some((like) => like.stationId === stationId);
  return (
    <Heart liked={liked} onPress={() => toggleStationLike(stationId)} style={style} size={size} />
  );
}

function PodcastEpisodeHeart({
  track,
  style,
  size,
}: {
  track: any;
  style?: ViewStyle;
  size?: number;
}) {
  const likes = usePodcastEpisodeLikes();
  const liked = likes.some((like) => like.episodeId === track.podcastEpisodeId);
  return (
    <Heart
      liked={liked}
      onPress={() => togglePodcastEpisodeLike(track)}
      style={style}
      size={size}
    />
  );
}
