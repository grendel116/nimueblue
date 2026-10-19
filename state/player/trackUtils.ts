import { TrackType } from "react-native-track-player";
import { audioTrackType, resolveArtworkUrl } from "@/scripts/utils";
import { API_ROOT } from "@/constants/api-root";
import { API_KEY } from "@/constants/api-key";
import { findDownload } from "@/scripts/downloadManager";

// Same track: by Mirlo id when both have one, by station/podcast identifier, otherwise by stream URL
export function isSameTrack(a: RNTrack, b: RNTrack): boolean {
  if (a.id !== undefined && b.id !== undefined) return a.id === b.id;
  if (a.liveStation && b.liveStation) return a.liveStation === b.liveStation;
  if (a.podcastEpisodeId && b.podcastEpisodeId) return a.podcastEpisodeId === b.podcastEpisodeId;
  return Boolean(a.url) && a.url === b.url;
}

export function resolveStreamUrl(rawAudio: string): string {
  if (!rawAudio) return "";
  if (/^(https?|file):\/\//.test(rawAudio)) return rawAudio;
  const path = rawAudio.startsWith("/") ? rawAudio : `/${rawAudio}`;
  if (API_ROOT && API_ROOT !== "/" && path.startsWith(`${API_ROOT}/`)) return path;
  return `${API_ROOT}${path}`;
}

let nextQueueKeyId = 1;

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
  const artist =
    (typeof t.artist === "string" && t.artist) ||
    (t.artist as any)?.name ||
    t.trackArtists?.[0]?.artistName ||
    t.trackGroup?.artist?.name ||
    fallback.artist ||
    "";

  let cleanTrackGroup = t.trackGroup;
  if (t.trackGroup && typeof t.trackGroup === "object") {
    const { tracks: _tracks, ...restGroup } = t.trackGroup as AlbumProps;
    cleanTrackGroup = restGroup;
  }

  return {
    ...t,
    trackGroup: cleanTrackGroup,
    _queueKey: t._queueKey || `qk-${nextQueueKeyId++}`,
    url: streamUrl,
    headers: saved ? {} : t.headers || { "mirlo-api-key": API_KEY },
    type: saved ? TrackType.Default : t.type || audioTrackType(streamUrl),
    // Android's player rejects an empty artwork URL; tracks without art leave it out
    artwork: artwork || undefined,
    artist,
  };
}

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

