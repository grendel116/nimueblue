import { TrackType } from "react-native-track-player";
import { audioTrackType, decodeHtmlEntities, resolveArtworkUrl } from "@/scripts/utils";
import { API_ROOT } from "@/constants/api-root";
import { API_KEY } from "@/constants/api-key";
import { findDownload, nameKey, sameAlbum } from "@/scripts/downloadManager";

// Same track: by stream URL, Mirlo id, station/podcast identifier, or matched download/album
export function isSameTrack(a?: RNTrack | null, b?: RNTrack | null): boolean {
  if (!a || !b) return false;
  if (Boolean(a.url) && a.url === b.url) return true;
  if (a.id !== undefined && b.id !== undefined && a.id !== 0 && b.id !== 0 && a.id === b.id) {
    return true;
  }
  if (Boolean(a.liveStation) && a.liveStation === b.liveStation) return true;
  if (Boolean(a.podcastEpisodeId) && a.podcastEpisodeId === b.podcastEpisodeId) return true;
  if (Boolean(a.url) && findDownload(b)?.url === a.url) return true;
  if (Boolean(b.url) && findDownload(a)?.url === b.url) return true;
  if (a.title && b.title && nameKey(a.title) === nameKey(b.title)) {
    if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
      return false;
    }
    const albumA = {
      title: a.trackGroup?.title || (a as any).albumTitle,
      artist: (typeof a.artist === "string" ? a.artist : undefined) || a.trackGroup?.artist?.name,
    };
    const albumB = {
      title: b.trackGroup?.title || (b as any).albumTitle,
      artist: (typeof b.artist === "string" ? b.artist : undefined) || b.trackGroup?.artist?.name,
    };
    if (albumA.title && albumB.title && sameAlbum(albumA, albumB)) {
      return true;
    }
  }
  return false;
}

export function resolveStreamUrl(rawAudio: string): string {
  if (!rawAudio) return "";
  if (/^(https?|file|content):\/|^blob:/.test(rawAudio)) return rawAudio;
  const path = rawAudio.startsWith("/") ? rawAudio : `/${rawAudio}`;
  if (API_ROOT && API_ROOT !== "/" && path.startsWith(`${API_ROOT}/`)) return path;
  return `${API_ROOT}${path}`;
}

// Prepares any track for the player: absolute stream URL, API key header, artwork, and artist.
// A song saved on the phone plays from its file instead of streaming
export function toPlayerTrack(
  t: RNTrack,
  fallback: { artwork?: string; artist?: string } = {},
): RNTrack {
  const cover = t.trackGroup?.cover as any;
  const saved = findDownload(t);
  const streamUrl = saved?.url ?? resolveStreamUrl(t.url || t.audio?.url || "");
  const artwork = resolveArtworkUrl(
    saved?.artwork ||
      t.artwork ||
      cover?.sizes?.[600] ||
      cover?.sizes?.[300] ||
      cover?.sizes?.[120] ||
      (typeof cover === "string" ? cover : cover?.url) ||
      fallback.artwork ||
      "",
  );
  const rawArtist =
    saved?.artist ||
    (typeof t.artist === "string" && t.artist) ||
    (t.artist as any)?.name ||
    t.trackArtists?.[0]?.artistName ||
    t.trackGroup?.artist?.name ||
    fallback.artist ||
    "";
  const artist = decodeHtmlEntities(rawArtist);
  const rawTitle = saved?.title || t.title;
  const title = rawTitle ? decodeHtmlEntities(rawTitle) : rawTitle;

  let cleanTrackGroup = t.trackGroup;
  if (t.trackGroup && typeof t.trackGroup === "object") {
    const { tracks: _tracks, ...restGroup } = t.trackGroup as AlbumProps;
    const groupTitle = saved?.albumTitle || restGroup.title;
    cleanTrackGroup = {
      ...restGroup,
      title: groupTitle ? decodeHtmlEntities(groupTitle) : groupTitle,
      artist: restGroup.artist
        ? { ...restGroup.artist, name: artist || restGroup.artist.name }
        : ({ name: artist } as Artist),
    };
  }

  return {
    ...t,
    title,
    trackGroup: cleanTrackGroup,
    trackArtists: saved?.artist ? undefined : t.trackArtists,
    url: streamUrl,
    headers: saved ? {} : t.headers || { "mirlo-api-key": API_KEY },
    type: saved ? TrackType.Default : t.type || audioTrackType(streamUrl),
    // Android's player rejects an empty artwork URL; tracks without art leave it out
    artwork: artwork || undefined,
    artist,
  };
}

export { toNormalizedTrack } from "./queueModel";

/**
 * Strips down a track object to strictly the properties required by native
 * ExoPlayer / AVPlayer across the React Native bridge. This minimizes JSON serialization
 * overhead and prevents UI thread starvation when loading large queues.
 */
export function toNativeTrack(t: RNTrack) {
  const duration =
    typeof t.duration === "number" && !isNaN(t.duration) && t.duration > 0
      ? t.duration
      : typeof t.audio?.duration === "number" && !isNaN(t.audio.duration) && t.audio.duration > 0
        ? t.audio.duration
        : undefined;

  return {
    url: t.url,
    title: t.title || "Track",
    artist: t.artist || "Unknown Artist",
    artwork: t.artwork || undefined,
    duration,
    album: t.trackGroup?.title || undefined,
    headers: t.headers,
    type: t.type,
    _queueKey: t._queueKey,
    id: t.id,
    liveStation: t.liveStation,
  };
}

