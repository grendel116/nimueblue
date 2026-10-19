import { create } from "zustand";
import * as Q from "./queueModel";
import { kvStorage } from "@/scripts/storage/kvStorage";

const QUEUE_STORAGE_KEY = "nimue.queue";

function buildTracksByKey(q: Q.QueueState): Record<string, RNTrack> {
  const map: Record<string, RNTrack> = {};
  if (q.current?.track?._queueKey) {
    map[q.current.track._queueKey] = q.current.track;
  }
  for (const h of q.history) {
    if (h.track?._queueKey) map[h.track._queueKey] = h.track;
  }
  for (const t of q.userQueue) {
    if (t._queueKey) map[t._queueKey] = t;
  }
  for (const t of q.nextUp) {
    if (t._queueKey) map[t._queueKey] = t;
  }
  for (const t of q.discovery) {
    if (t._queueKey) map[t._queueKey] = t;
  }
  return map;
}

export interface QueueStoreState {
  queue: Q.QueueState;
  activeTrack: RNTrack | undefined;
  userQueue: RNTrack[];
  upcoming: RNTrack[];
  queueSource: string;
  tracksByKey: Record<string, RNTrack>;
  setQueueState: (next: Q.QueueState) => void;
  resetQueue: () => void;
}

// Synchronously load saved queue from MMKV / localStorage without bridge delay
const initialQueue: Q.QueueState = Q.fromSaved(kvStorage.getString(QUEUE_STORAGE_KEY) ?? null);

export const useQueueStore = create<QueueStoreState>((set) => ({
  queue: initialQueue,
  activeTrack: initialQueue.current?.track,
  userQueue: initialQueue.userQueue,
  upcoming: Q.upcoming(initialQueue),
  queueSource: initialQueue.source,
  tracksByKey: buildTracksByKey(initialQueue),

  setQueueState: (next: Q.QueueState) => {
    // 1. Fast synchronous persistence (< 0.1ms via MMKV / localStorage JSI)
    kvStorage.set(QUEUE_STORAGE_KEY, Q.toSaved(next));

    // 2. Update normalized store slices
    set({
      queue: next,
      activeTrack: next.current?.track,
      userQueue: next.userQueue,
      upcoming: Q.upcoming(next),
      queueSource: next.source,
      tracksByKey: buildTracksByKey(next),
    });
  },

  resetQueue: () => {
    kvStorage.delete(QUEUE_STORAGE_KEY);
    set({
      queue: Q.emptyQueue,
      activeTrack: undefined,
      userQueue: [],
      upcoming: [],
      queueSource: "",
      tracksByKey: {},
    });
  },
}));

/**
 * Surgical selector hook: subscribes strictly to the specific track matching queueKey.
 * Prevents re-rendering other queue rows when unrelated tracks update.
 */
export function useTrackByKey(key?: string): RNTrack | undefined {
  return useQueueStore((s) => (key ? s.tracksByKey[key] : undefined));
}
