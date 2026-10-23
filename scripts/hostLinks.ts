import { MIRLO_WEB } from "@/queries/listener";

// Every host sells and takes support on its own pages; the app only opens them. A release's
// page on its host handles price, payment and downloads, and an artist's support page handles
// tips and memberships. A new federated host adds its addresses here

type ReleaseLink = {
  source?: string;
  sourceUrl?: string;
  urlSlug?: string | number | null;
  artistId?: number | string | null;
  artist?: { urlSlug?: string; id?: number | string } | null;
};

function mirloArtistSlug(release: ReleaseLink): string | undefined {
  const slug = release.artist?.urlSlug || release.artistId || release.artist?.id;
  return slug ? String(slug) : undefined;
}

// Mirlo's own releases; tracks Mirlo serves without naming a source are Mirlo's too
function isMirlo(release: ReleaseLink): boolean {
  return (release.source ?? "Mirlo Space") === "Mirlo Space";
}

// Where the listener buys, downloads, or supports the release
export function releasePageUrl(release: ReleaseLink): string | undefined {
  if (isMirlo(release)) {
    const artist = mirloArtistSlug(release);
    return artist && release.urlSlug ? `${MIRLO_WEB}/${artist}/release/${release.urlSlug}` : undefined;
  }
  return release.sourceUrl;
}

// Supporting a release opens the same host page where the release is purchased or downloaded
export function releaseSupportUrl(release: ReleaseLink): string | undefined {
  return releasePageUrl(release);
}

export function mirloSupportUrl(artistSlug: string): string {
  return `${MIRLO_WEB}/${artistSlug}`;
}
