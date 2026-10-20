import React from "react";
import {
  isFaircampArtistFollowed,
  toggleFaircampArtistFollow,
  useFaircampSaves,
} from "@/scripts/faircampSaves";
import PillButton from "@/components/artist/PillButton";

// Follow or unfollow an artist locally on the device
export default function FollowArtistButton({ artist }: { artist: Artist }) {
  const saves = useFaircampSaves();
  const isFollowing = isFaircampArtistFollowed(artist, saves);

  return (
    <PillButton
      icon={isFollowing ? "checkmark" : "add"}
      label={isFollowing ? "Following" : "Follow"}
      filled={!isFollowing}
      onPress={() => toggleFaircampArtistFollow(artist)}
      accessibilityLabel={
        isFollowing ? `Unfollow ${artist.name}` : `Follow ${artist.name}`
      }
    />
  );
}
