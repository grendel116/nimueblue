// Mirlo's web address and the artists a listener follows

export const MIRLO_WEB = "https://mirlo.space";

export type ArtistRelation = {
  isFollowing: boolean;
  // The paid tier the listener subscribes to, if any
  subscriptionTier?: SubscriptionTier;
};

export function artistRelation(
  user: LoggedInUser | null | undefined,
  artistId: number | undefined,
): ArtistRelation {
  const tiers = (user?.artistUserSubscriptions ?? [])
    .map((s) => s.artistSubscriptionTier)
    .filter((tier) => tier && tier.artistId === artistId);
  return {
    isFollowing: tiers.length > 0,
    subscriptionTier: tiers.find((tier) => !tier.isDefaultTier),
  };
}

export type FollowedArtist = { artist: Artist; tierName?: string };

// Each artist once: subscribers first with their tier name, then free follows
export function followedArtists(user: LoggedInUser | null | undefined): FollowedArtist[] {
  const byArtist = new Map<number, FollowedArtist>();
  (user?.artistUserSubscriptions ?? []).forEach(({ artistSubscriptionTier: tier }) => {
    if (!tier?.artist) return;
    const existing = byArtist.get(tier.artistId);
    if (!tier.isDefaultTier) {
      byArtist.set(tier.artistId, { artist: tier.artist, tierName: tier.name });
    } else if (!existing) {
      byArtist.set(tier.artistId, { artist: tier.artist });
    }
  });
  return Array.from(byArtist.values()).sort(
    (a, b) => Number(Boolean(b.tierName)) - Number(Boolean(a.tierName)),
  );
}
