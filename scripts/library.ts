import {
  DownloadedTrack,
  downloadedAlbumMatcher,
} from "@/scripts/downloadManager";
import { resolveArtworkUrl } from "@/scripts/utils";
import { PodcastShowBookmark } from "@/scripts/podcastLikes";
import { FaircampSaves } from "@/scripts/faircampSaves";
import { findStation, liveTrack } from "@/queries/radio";
import { FollowedArtist } from "@/queries/listener";

export function albumCover(tg: any): string {
  return resolveArtworkUrl(
    tg?.cover?.sizes?.[300] ||
      tg?.cover?.sizes?.[120] ||
      tg?.cover?.sizes?.[600] ||
      (typeof tg?.cover === "string" ? tg.cover : tg?.cover?.url),
  );
}

export type WishlistAlbum = { trackGroup: AlbumProps; savedAt: number };

// One record, one box: an album moves from Wishlist to Downloads once saved on the device.
// downloadedAlbumMatcher tells which albums are already there.

// Wishlist: albums saved on the device or holding a liked song, newest first.
// Albums already downloaded move out to Downloads. Each album opens its page.
export function buildWishlistAlbums({
  faircampSaves,
  downloads = [],
}: {
  faircampSaves: FaircampSaves;
  downloads?: DownloadedTrack[];
}): WishlistAlbum[] {
  const albums = new Map<string, WishlistAlbum>();
  const isDownloaded = downloadedAlbumMatcher(downloads);
  const keep = (trackGroup: any, savedAt: number) => {
    if (!trackGroup || isDownloaded(trackGroup)) return;
    const key = String(trackGroup.urlSlug || trackGroup.id);
    const existing = albums.get(key);
    albums.set(key, {
      trackGroup: existing?.trackGroup ?? trackGroup,
      savedAt: Math.max(existing?.savedAt ?? 0, savedAt),
    });
  };

  faircampSaves.albums.forEach(({ album, savedAt }) => keep(album, savedAt));
  faircampSaves.tracks.forEach(({ track, likedAt }) => keep(track.trackGroup, likedAt));

  return Array.from(albums.values()).sort((a, b) => b.savedAt - a.savedAt);
}

// Artists followed on this device
export function buildFollowedArtists({
  faircampSaves,
}: {
  faircampSaves?: FaircampSaves;
}): FollowedArtist[] {
  return (faircampSaves?.artists ?? []).map(({ artist }): FollowedArtist => ({
    artist,
  }));
}

export type BookmarkItem =
  | { kind: "station"; track: RNTrack }
  | { kind: "show"; show: PodcastShowBookmark };

// Bookmarks: radio stations and podcast shows, kept on the device, newest first
export function buildBookmarks({
  stationLikes,
  podcastShows = [],
}: {
  stationLikes: { stationId: string; likedAt: number }[];
  podcastShows?: PodcastShowBookmark[];
}): BookmarkItem[] {
  const stations = stationLikes.flatMap(({ stationId, likedAt }) => {
    const station = findStation(stationId);
    return station
      ? [{ item: { kind: "station", track: liveTrack(station) } as BookmarkItem, savedAt: likedAt }]
      : [];
  });
  const shows = podcastShows.map((show) => ({
    item: { kind: "show", show } as BookmarkItem,
    savedAt: show.bookmarkedAt,
  }));
  return [...stations, ...shows].sort((a, b) => b.savedAt - a.savedAt).map(({ item }) => item);
}
