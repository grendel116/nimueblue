import AsyncStorage from "@react-native-async-storage/async-storage";

const PLAY_COUNTS_KEY = "mirlo_blue_play_counts_v1";

// A track whose free previews are used up holds this count
const EXHAUSTED = Number.MAX_SAFE_INTEGER;

// In-memory cache for synchronous entitlement evaluations
let playCountsCache: Record<number, number> | null = null;
type PlayCountsListener = (counts: Record<number, number>) => void;
const listeners = new Set<PlayCountsListener>();

/**
 * Loads the consolidated dictionary of track play counts from storage.
 */
async function getTrackPlayCounts(): Promise<Record<number, number>> {
  if (playCountsCache !== null) return playCountsCache;
  try {
    const raw = await AsyncStorage.getItem(PLAY_COUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        playCountsCache = parsed;
        return parsed;
      }
    }
  } catch (err) {
    console.error("Failed to load play counts:", err);
  }
  const emptyCounts: Record<number, number> = {};
  playCountsCache = emptyCounts;
  return emptyCounts;
}

/**
 * Synchronous check for current play count of a track from memory cache.
 */
export function getTrackPlaysSync(trackId: number): number {
  return playCountsCache?.[trackId] ?? 0;
}

export function isTrackDisabledSync(trackId: number): boolean {
  return getTrackPlaysSync(trackId) >= EXHAUSTED;
}

/**
 * Persists the consolidated play counts dictionary.
 */
async function persistPlayCounts(next: Record<number, number>): Promise<void> {
  playCountsCache = next;
  try {
    await AsyncStorage.setItem(PLAY_COUNTS_KEY, JSON.stringify(next));
  } catch (err) {
    console.error("Failed to persist play counts:", err);
  }
  listeners.forEach((listener) => {
    try {
      listener(next);
    } catch (e) {
      console.error("Play counts listener error:", e);
    }
  });
}

/**
 * Records a played track, incrementing its play count in persistent storage.
 */
export async function recordTrackPlay(trackId: number, maxFreePlays?: number): Promise<number> {
  const counts = await getTrackPlayCounts();
  const updated = (counts[trackId] ?? 0) + 1;
  const isExhausted = maxFreePlays !== undefined && maxFreePlays !== null && updated >= maxFreePlays;
  await persistPlayCounts({ ...counts, [trackId]: isExhausted ? EXHAUSTED : updated });
  return updated;
}

/**
 * Marks a track's preview plays as used up (e.g. on HTTP 402 Payment Required).
 */
export async function markTrackDisabled(trackId: number): Promise<void> {
  const counts = await getTrackPlayCounts();
  await persistPlayCounts({ ...counts, [trackId]: EXHAUSTED });
}

/**
 * Determines whether a track has reached its free preview threshold.
 */
export async function isPlaybackLimitReached(
  trackId: number,
  maxFreePlays?: number,
): Promise<boolean> {
  const plays = (await getTrackPlayCounts())[trackId] ?? 0;
  if (plays >= EXHAUSTED) return true;
  return maxFreePlays !== undefined && maxFreePlays !== null && plays >= maxFreePlays;
}

function disabledIds(counts: Record<number, number>): Set<number> {
  const disabled = new Set<number>();
  for (const [id, count] of Object.entries(counts)) {
    if (count >= EXHAUSTED) disabled.add(Number(id));
  }
  return disabled;
}

export async function getDisabledTrackIds(): Promise<Set<number>> {
  return disabledIds(await getTrackPlayCounts());
}

/**
 * Subscribes to the set of disabled tracks, called whenever play counts change.
 */
export function subscribeDisabledTracks(listener: (disabled: Set<number>) => void): () => void {
  const onCounts: PlayCountsListener = (counts) => listener(disabledIds(counts));
  listeners.add(onCounts);
  return () => {
    listeners.delete(onCounts);
  };
}

/**
 * Clears all recorded play counts and limits.
 */
export async function clearPlayCounts(): Promise<void> {
  await persistPlayCounts({});
  try {
    await AsyncStorage.removeItem(PLAY_COUNTS_KEY);
  } catch (err) {
    console.error("Failed to clear play counts:", err);
  }
}
