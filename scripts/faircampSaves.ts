import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

export type FaircampSavedTrack = {
  track: RNTrack;
  likedAt: number;
};

export type FaircampSavedAlbum = {
  album: AlbumProps;
  savedAt: number;
};

export type FaircampSavedArtist = {
  artist: Artist;
  followedAt: number;
};

export type FaircampSaves = {
  tracks: FaircampSavedTrack[];
  albums: FaircampSavedAlbum[];
  artists?: FaircampSavedArtist[];
};

const STORAGE_KEY = "mirlo_blue_faircamp_saves_v1";

let saves: FaircampSaves = { tracks: [], albums: [], artists: [] };
let loaded: Promise<void> | null = null;
const listeners = new Set<(saves: FaircampSaves) => void>();

export function isSameSavedTrack(a: RNTrack, b: RNTrack): boolean {
  if (typeof a.id === "number" && typeof b.id === "number" && a.id > 0 && b.id > 0) {
    return a.id === b.id;
  }
  if (a.fairplayerTrackId && b.fairplayerTrackId) {
    return a.fairplayerTrackId === b.fairplayerTrackId;
  }
  if (a.url && b.url && a.url === b.url) {
    return true;
  }
  if (a.audio?.url && b.audio?.url && a.audio.url === b.audio.url) {
    return true;
  }
  if (a.url && b.audio?.url && (a.url === b.audio.url || a.url.endsWith(b.audio.url))) {
    return true;
  }
  if (b.url && a.audio?.url && (b.url === a.audio.url || b.url.endsWith(a.audio.url))) {
    return true;
  }
  if (
    a.title &&
    b.title &&
    a.title.trim().toLowerCase() === b.title.trim().toLowerCase() &&
    a.artist &&
    b.artist &&
    a.artist.trim().toLowerCase() === b.artist.trim().toLowerCase()
  ) {
    const aAlbum = a.trackGroup?.title || (a as any).album;
    const bAlbum = b.trackGroup?.title || (b as any).album;
    if (!aAlbum || !bAlbum || aAlbum.trim().toLowerCase() === bAlbum.trim().toLowerCase()) {
      return true;
    }
  }
  return false;
}

export function albumMatches(
  a?: { id?: number; urlSlug?: string; title?: string; artist?: any; trackGroupId?: number } | null,
  b?: { id?: number; urlSlug?: string; title?: string; artist?: any; trackGroupId?: number } | null,
): boolean {
  if (!a || !b) return false;
  const aId = a.id || a.trackGroupId;
  const bId = b.id || b.trackGroupId;
  if (typeof aId === "number" && typeof bId === "number" && aId > 0 && bId > 0) {
    return aId === bId;
  }
  if (a.urlSlug && b.urlSlug && a.urlSlug === b.urlSlug) {
    return true;
  }
  if (a.urlSlug && bId && a.urlSlug === String(bId)) {
    return true;
  }
  if (b.urlSlug && aId && b.urlSlug === String(aId)) {
    return true;
  }
  if (
    a.title &&
    b.title &&
    a.title.trim().toLowerCase() === b.title.trim().toLowerCase()
  ) {
    const aArtist = typeof a.artist === "string" ? a.artist : a.artist?.name;
    const bArtist = typeof b.artist === "string" ? b.artist : b.artist?.name;
    if (!aArtist || !bArtist || aArtist.trim().toLowerCase() === bArtist.trim().toLowerCase()) {
      return true;
    }
  }
  return false;
}

function trackBelongsToAlbum(
  track: RNTrack,
  targetAlbum: { id?: number; urlSlug?: string; title?: string; trackGroupId?: number },
): boolean {
  if (track.trackGroup && albumMatches(track.trackGroup as AlbumProps, targetAlbum)) {
    return true;
  }
  const targetId = targetAlbum.id || targetAlbum.trackGroupId;
  if (track.trackGroupId !== undefined && targetId !== undefined && track.trackGroupId === targetId) {
    return true;
  }
  if (targetAlbum.urlSlug) {
    if (track.trackGroup?.urlSlug === targetAlbum.urlSlug) return true;
    if (String(track.trackGroupId) === targetAlbum.urlSlug) return true;
  }
  return false;
}

function artistKey(artist: { id?: number; urlSlug?: string; name?: string }): string {
  return artist.urlSlug || (artist.id ? String(artist.id) : (artist.name || "").toLowerCase().trim());
}

function publish(): void {
  listeners.forEach((listener) => listener(saves));
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
  } catch (error) {
    console.error("Failed to save Faircamp likes and wishlists:", error);
  }
}

function load(): Promise<void> {
  loaded ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FaircampSaves>;
        saves = {
          tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [],
          albums: Array.isArray(parsed.albums) ? parsed.albums : [],
          artists: Array.isArray(parsed.artists) ? parsed.artists : [],
        };
      }
      publish();
    })
    .catch((error) => {
      console.error("Failed to load Faircamp likes and wishlists:", error);
    });
  return loaded;
}

export async function toggleFaircampTrackLike(track: RNTrack): Promise<void> {
  await load();
  const exists = saves.tracks.some((saved) => isSameSavedTrack(saved.track, track));
  const hasAlbum = Boolean(
    track.trackGroup && (track.trackGroup.urlSlug || track.trackGroup.id),
  );
  const { tracks: _tracks, ...cleanTrackGroup } = (track.trackGroup || {}) as AlbumProps;
  const cleanTrack = hasAlbum ? { ...track, trackGroup: cleanTrackGroup } : track;
  const nextTracks = exists
    ? saves.tracks.filter((saved) => !isSameSavedTrack(saved.track, track))
    : [{ track: cleanTrack, likedAt: Date.now() }, ...saves.tracks];

  let nextAlbums = saves.albums;
  if (hasAlbum) {
    if (!exists) {
      if (!saves.albums.some((saved) => albumMatches(saved.album, cleanTrackGroup))) {
        nextAlbums = [{ album: cleanTrackGroup, savedAt: Date.now() }, ...saves.albums];
      }
    } else {
      const anyTrackStillLiked = nextTracks.some((saved) =>
        trackBelongsToAlbum(saved.track, cleanTrackGroup),
      );
      if (!anyTrackStillLiked) {
        nextAlbums = saves.albums.filter(
          (saved) => !albumMatches(saved.album, cleanTrackGroup),
        );
      }
    }
  }

  saves = {
    ...saves,
    tracks: nextTracks,
    albums: nextAlbums,
  };
  publish();
  await persist();
}

export function isFaircampAlbumWishlisted(
  album: { id?: number; urlSlug?: string; title?: string },
  currentSaves: FaircampSaves = saves,
): boolean {
  if (!album) return false;
  return (
    currentSaves.albums.some((saved) => albumMatches(saved.album, album)) ||
    currentSaves.tracks.some((saved) => trackBelongsToAlbum(saved.track, album))
  );
}

export async function toggleFaircampAlbumWishlist(
  album: AlbumProps,
  displayedTracks: RNTrack[],
): Promise<void> {
  await load();
  const { tracks: _tracks, ...cleanAlbum } = album;
  const exists = isFaircampAlbumWishlisted(cleanAlbum, saves);
  saves = {
    ...saves,
    tracks: exists
      ? saves.tracks.filter(
          (saved) =>
            !displayedTracks.some((t) => isSameSavedTrack(saved.track, t)) &&
            !trackBelongsToAlbum(saved.track, cleanAlbum),
        )
      : [
          ...displayedTracks
            .filter(
              (track) =>
                !saves.tracks.some((saved) => isSameSavedTrack(saved.track, track)),
            )
            .map((track) => ({
              track: { ...track, trackGroup: cleanAlbum },
              likedAt: Date.now(),
            })),
          ...saves.tracks,
        ],
    albums: exists
      ? saves.albums.filter((saved) => !albumMatches(saved.album, cleanAlbum))
      : [
          { album: cleanAlbum, savedAt: Date.now() },
          ...saves.albums.filter((saved) => !albumMatches(saved.album, cleanAlbum)),
        ],
  };
  publish();
  await persist();
}

export function isFaircampArtistFollowed(
  artist: { id?: number; urlSlug?: string; name?: string },
  currentSaves: FaircampSaves = saves,
): boolean {
  const key = artistKey(artist);
  if (!key) return false;
  return (currentSaves.artists ?? []).some((saved) => artistKey(saved.artist) === key);
}

export async function toggleFaircampArtistFollow(artist: Artist): Promise<void> {
  await load();
  const key = artistKey(artist);
  if (!key) return;
  const currentArtists = saves.artists ?? [];
  const exists = currentArtists.some((saved) => artistKey(saved.artist) === key);
  const { trackGroups: _trackGroups, ...cleanArtist } = artist;
  saves = {
    ...saves,
    artists: exists
      ? currentArtists.filter((saved) => artistKey(saved.artist) !== key)
      : [{ artist: cleanArtist as Artist, followedAt: Date.now() }, ...currentArtists],
  };
  publish();
  await persist();
}

export function isFaircampTrackLiked(track: RNTrack): boolean {
  if (!track) return false;
  return saves.tracks.some((saved) => isSameSavedTrack(saved.track, track));
}

export function useFaircampSaves(): FaircampSaves {
  const [current, setCurrent] = useState(saves);
  useEffect(() => {
    listeners.add(setCurrent);
    load();
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  return current;
}

