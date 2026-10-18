import { fairplayerReleaseSlug } from "@/queries/fairplayer";

export type AlbumLink = {
  urlSlug?: string | number | null;
  artistId?: number | string | null;
  artist?: { urlSlug?: string; id?: number | string } | null;
};

// The artist part of a release's address. Faircamp releases carry their artist in the slug
export function albumArtistRouteId(album: AlbumLink): string | undefined {
  const slug = String(album.urlSlug ?? "");
  const id =
    fairplayerReleaseSlug.artistRouteId(slug) ??
    (album.artist?.urlSlug || album.artistId || album.artist?.id);
  return id ? String(id) : undefined;
}

// The page of a release, where the listener can play or buy it
export function albumHref(album?: AlbumLink) {
  const id = album && albumArtistRouteId(album);
  if (!album?.urlSlug || !id) return undefined;
  return {
    pathname: "/artist/[id]/album/[slug]/album-tracks" as const,
    params: { id, slug: String(album.urlSlug) },
  };
}
