import React from "react";
import { useQuery } from "@tanstack/react-query";
import { queryArtistFollowers } from "@/queries/listener";
import {
  isFaircampArtistFollowed,
  toggleFaircampArtistFollow,
  useFaircampSaves,
} from "@/scripts/faircampSaves";
import PillButton from "@/components/artist/PillButton";

// Follow or unfollow an artist locally on the device
export default function FollowArtistButton({ artist }: { artist: Artist }) {
  const isMirlo = Boolean(artist.onMirlo);
  const saves = useFaircampSaves();
  const { data: followers } = useQuery(queryArtistFollowers(isMirlo ? artist.id : undefined));
  const count = isMirlo && typeof followers === "number" ? String(followers) : undefined;
  const isFollowing = isFaircampArtistFollowed(artist, saves);

  return (
    <PillButton
      icon={isFollowing ? "checkmark" : "add"}
      label={isFollowing ? "Following" : "Follow"}
      detail={count}
      filled={!isFollowing}
      onPress={() => toggleFaircampArtistFollow(artist)}
      accessibilityLabel={
        isFollowing ? `Unfollow ${artist.name}` : `Follow ${artist.name}`
      }
    />
  );
}
