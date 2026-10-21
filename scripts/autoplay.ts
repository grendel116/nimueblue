import * as api from "@/queries/fetch/fetchWrapper";
import { API_KEY } from "@/constants/api-key";
import { shuffle, trackStreamPath } from "@/scripts/utils";
import { isTrackDisabledSync } from "@/scripts/trackPlayUtils";
import { fetchFairplayerDiscoveryTracks } from "@/queries/fairplayer";
import { kvStorage } from "@/scripts/storage/kvStorage";
import { toNormalizedTrack } from "@/state/player/queueModel";

export const AUTOPLAY_SOURCE = "Discovery";
export const DISCOVERY_POOL_KEY = "nimue.discovery_pool";
export const DISCOVERY_PLAYED_KEY = "nimue.discovery_played";
export const RESERVOIR_TARGET = 30;
export const DISCOVERY_BUFFER_SIZE = 12;

// Loads the cached reservoir from kvStorage (MMKV on native, localStorage in web shell)
export function getDiscoveryReservoir(): RNTrack[] {
  try {
    const raw = kvStorage.getString(DISCOVERY_POOL_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.map(toNormalizedTrack).filter(Boolean);
  } catch {
    return [];
  }
}

// Persists the normalized discovery reservoir to kvStorage
export function saveDiscoveryReservoir(tracks: RNTrack[]): void {
  try {
    const normalized = tracks.slice(0, 40).map(toNormalizedTrack);
    kvStorage.set(DISCOVERY_POOL_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.error("Failed to save discovery reservoir:", err);
  }
}

// Set of track identifiers that have recently been scheduled or played in Discovery
export function getPlayedDiscoveryIds(): Set<string | number> {
  try {
    const raw = kvStorage.getString(DISCOVERY_PLAYED_KEY);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

// Records an ID as consumed, keeping a rolling window of recent items
export function recordPlayedDiscoveryId(id: string | number): void {
  try {
    const ids = Array.from(getPlayedDiscoveryIds());
    ids.push(id);
    const trimmed = ids.slice(-200);
    kvStorage.set(DISCOVERY_PLAYED_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

// Synchronously draws up to `count` fresh tracks from the reservoir without network delay
export function drawFromReservoir(
  count: number,
  knownIds: Set<string | number>,
  knownUrls: Set<string>,
): RNTrack[] {
  if (count <= 0) return [];
  const pool = getDiscoveryReservoir();
  if (pool.length === 0) return [];

  const playedIds = getPlayedDiscoveryIds();
  const drawn: RNTrack[] = [];
  const remaining: RNTrack[] = [];

  for (const track of pool) {
    const idMatches = track.id !== undefined && (knownIds.has(track.id) || playedIds.has(track.id));
    const urlMatches = Boolean(track.url) && knownUrls.has(track.url);

    if (idMatches || urlMatches) {
      // Discard tracks that are already known or played
      continue;
    }

    if (drawn.length < count) {
      drawn.push(track);
      if (track.id !== undefined) {
        knownIds.add(track.id);
        recordPlayedDiscoveryId(track.id);
      }
      if (track.url) knownUrls.add(track.url);
    } else {
      remaining.push(track);
    }
  }

  saveDiscoveryReservoir(remaining);
  return drawn;
}

let isReplenishing = false;

// Background task: replenishes the local reservoir up to RESERVOIR_TARGET
export async function replenishDiscoveryReservoir(
  knownIds: Set<string | number> = new Set(),
  knownUrls: Set<string> = new Set(),
): Promise<RNTrack[]> {
  if (isReplenishing) return [];
  isReplenishing = true;

  try {
    const currentPool = getDiscoveryReservoir();
    const needed = RESERVOIR_TARGET - currentPool.length;
    if (needed <= 4) return []; // Reservoir is already sufficiently stocked

    const playedIds = getPlayedDiscoveryIds();
    const fetched = await fetchDiscoveryTracks(Math.max(14, needed));
    if (fetched.length === 0) return [];

    const existingIds = new Set([
      ...currentPool.map((t) => t.id).filter((id): id is number => id !== undefined),
      ...knownIds,
      ...playedIds,
    ]);
    const existingUrls = new Set([
      ...currentPool.map((t) => t.url).filter(Boolean),
      ...knownUrls,
    ]);

    const fresh: RNTrack[] = [];
    for (const track of fetched) {
      const idMatches = track.id !== undefined && existingIds.has(track.id);
      const urlMatches = Boolean(track.url) && existingUrls.has(track.url);
      if (!idMatches && !urlMatches) {
        fresh.push(toNormalizedTrack(track));
        if (track.id !== undefined) existingIds.add(track.id);
        if (track.url) existingUrls.add(track.url);
      }
    }

    if (fresh.length > 0) {
      const updatedPool = [...currentPool, ...fresh].slice(0, RESERVOIR_TARGET + 10);
      saveDiscoveryReservoir(updatedPool);
    }

    return fresh;
  } catch (err) {
    console.warn("Background discovery replenishment skipped:", err);
    return [];
  } finally {
    isReplenishing = false;
  }
}

async function fetchMirloDiscoveryTracks(take: number): Promise<RNTrack[]> {
  const params = new URLSearchParams({
    take: String(take),
    orderBy: "random",
    distinctArtists: "true",
    isReleased: "released",
  });
  const { results } = await api.get<{ results: any[] }>(`/v1/trackGroups?${params}`, {});

  return (results || []).flatMap((album): RNTrack[] => {
    const previews = [...(album.tracks || [])]
      .filter((t: any) => t?.id && t.isPreview && !isTrackDisabledSync(Number(t.id)))
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    const t = previews.find((p: any) => p.isFeatured) ?? previews[0];
    if (!t) return [];
    return [
      {
        id: t.id,
        title: t.title,
        artist: album.artist?.name || "",
        artwork: album.cover?.sizes?.[600] || "",
        url: "",
        audio: { url: trackStreamPath(t.id), duration: undefined },
        queueIndex: 0,
        trackGroupId: album.id,
        trackGroup: {
          id: album.id,
          trackGroupId: album.id,
          title: album.title,
          artist: album.artist,
          artistId: album.artistId,
          urlSlug: album.urlSlug,
          cover: album.cover,
          releaseDate: album.releaseDate,
          userTrackGroupPurchases: [],
        },
        isPreview: true,
        order: t.order ?? 0,
        allowIndividualSale: Boolean(t.allowIndividualSale),
        headers: { "mirlo-api-key": API_KEY },
        autoplay: true,
      },
    ];
  });
}

// Fetches previews from a random set of Mirlo and verified Faircamp releases to continue
// playback after the current playlist runs out.
export async function fetchDiscoveryTracks(take: number): Promise<RNTrack[]> {
  if (take <= 0) return [];
  const faircampTarget = Math.max(1, Math.floor(take / 2));

  const [mirloResult, faircampResult] = await Promise.allSettled([
    fetchMirloDiscoveryTracks(take),
    fetchFairplayerDiscoveryTracks(faircampTarget),
  ]);

  const mirloTracks = mirloResult.status === "fulfilled" ? mirloResult.value : [];
  const faircampTracks =
    faircampResult.status === "fulfilled" ? faircampResult.value : [];

  if (mirloTracks.length === 0 && faircampTracks.length === 0) {
    if (mirloResult.status === "rejected") throw mirloResult.reason;
    return [];
  }

  const selectedFaircamp = faircampTracks.slice(0, faircampTarget);
  const remainingSlots = Math.max(0, take - selectedFaircamp.length);
  const selectedMirlo = shuffle(mirloTracks).slice(0, remainingSlots);

  return shuffle([...selectedMirlo, ...selectedFaircamp]);
}

