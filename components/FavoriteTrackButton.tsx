import { ViewStyle } from "react-native";
import LikeButton from "@/components/LikeButton";
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

// Tracks, radio stations and podcast episodes save their likes locally on the device.
// Songs are hearted; radio stations and podcast episodes are bookmarked
export default function FavoriteTrackButton({
  track,
  style,
  size,
}: FavoriteTrackButtonProps) {
  if (track.liveStation) {
    return <StationBookmark stationId={track.liveStation} style={style} size={size} />;
  }
  if (track.podcastEpisodeId) {
    return <PodcastEpisodeBookmark track={track} style={style} size={size} />;
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
    <LikeButton
      liked={liked}
      onPress={() => toggleFaircampTrackLike(track)}
      style={style}
      size={size}
    />
  );
}

function StationBookmark({
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
    <LikeButton
      kind="bookmark"
      liked={liked}
      onPress={() => toggleStationLike(stationId)}
      style={style}
      size={size}
    />
  );
}

function PodcastEpisodeBookmark({
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
    <LikeButton
      kind="bookmark"
      liked={liked}
      onPress={() => togglePodcastEpisodeLike(track)}
      style={style}
      size={size}
    />
  );
}
