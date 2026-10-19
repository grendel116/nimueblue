import {
  createContext,
  useState,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { AppState } from "react-native";
import TrackPlayer, {
  Event,
  usePlaybackState,
  useTrackPlayerEvents,
  State,
} from "react-native-track-player";
import { isPlaybackLimitReached, markTrackDisabled, subscribeDisabledTracks, isTrackDisabledSync, recordTrackPlay, getDisabledTrackIds } from "@/scripts/trackPlayUtils";
import { isMirloTrack, shuffle } from "@/scripts/utils";
import * as api from "../queries/fetch/fetchWrapper";
import {
  drawFromReservoir,
  replenishDiscoveryReservoir,
  DISCOVERY_BUFFER_SIZE,
} from "@/scripts/autoplay";
import { useIsOnline } from "@/scripts/useIsOnline";
import { blockFaircampDomain } from "@/queries/fairplayer";
import { getDownloadedTracks, subscribeDownloads } from "@/scripts/downloadManager";
import { resetRadioTimer } from "@/scripts/radioTimer";
import { createStore, type Store } from "./store";
import {
  type RepeatSetting,
  type QueueSection,
  type QueueSlot,
  type PlayerContextType,
  REPEAT_CYCLE,
  REPEAT_MODES,
} from "./player/types";
import { ensureTrackPlayerInitialized } from "./player/setup";
import { isSameTrack, toPlayerTrack, toNativeTrack } from "./player/trackUtils";
import * as Q from "./player/queueModel";
import { useQueueStore } from "./player/useQueueStore";
import { kvStorage } from "@/scripts/storage/kvStorage";

export type { RepeatSetting, QueueSection, QueueSlot, PlayerContextType };
export { ensureTrackPlayerInitialized };

const DISCOVERY_BATCH = 5;

type PlayerStore = Store<PlayerContextType>;

// Carries a store that never changes identity; components subscribe through usePlayer
export const PlayerContext = createContext<PlayerStore | null>(null);

const keysOf = (tracks: RNTrack[]) => tracks.map((t) => t._queueKey ?? "");
const sameKeys = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

export const PlayerContextProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [shuffled, setShuffled] = useState<boolean>(false);
  const [looping, setLooping] = useState<RepeatSetting>("none");
  const isOnline = useIsOnline();
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  const queue = useQueueStore((s) => s.queue);
  const setQueue = useQueueStore((s) => s.setQueueState);
  const playBackState = usePlaybackState();
  const incrementedRef = useRef(false);
  const [disabledTrackIds, setDisabledTrackIds] = useState<Set<number>>(new Set());

  // The queue as of the latest action, read by actions so each keeps one identity
  const queueRef = useRef<Q.QueueState>(useQueueStore.getState().queue);
  // What the audio player currently holds, by queue key, and the index it is playing
  const playerRef = useRef<{ keys: string[]; index: number }>({ keys: [], index: -1 });
  // Player calls run one at a time, in the order they were asked for
  const playerChain = useRef<Promise<void>>(Promise.resolve());

  const latest = useRef({ isPlaying: false, shuffled: false, looping: "none" as RepeatSetting, disabledTrackIds });

  useEffect(() => {
    getDisabledTrackIds().then((ids) => setDisabledTrackIds(new Set(ids)));
    return subscribeDisabledTracks((ids) => setDisabledTrackIds(new Set(ids)));
  }, []);

  const isTrackDisabled = useCallback(
    (trackId?: number) =>
      typeof trackId === "number" &&
      (disabledTrackIds.has(trackId) || isTrackDisabledSync(trackId)),
    [disabledTrackIds],
  );

  const trackDisabled = useCallback(
    (trackId?: number) =>
      typeof trackId === "number" &&
      (latest.current.disabledTrackIds.has(trackId) || isTrackDisabledSync(trackId)),
    [],
  );

  // Pauses a track that can't play and remembers it as disabled
  const stopDisabledTrack = async (trackId?: number) => {
    await TrackPlayer.pause();
    if (typeof trackId === "number" && trackId > 0) await markTrackDisabled(trackId);
  };

  const onPlayer = useCallback((work: () => Promise<void>) => {
    const run = playerChain.current.then(work).catch((err) => console.error("Player error:", err));
    playerChain.current = run;
    return run;
  }, []);

  // Gives the audio player the queue's play order. The song playing is left alone unless
  // it changed; otherwise only the songs around it are replaced. `start` begins playback
  const applyToPlayer = useCallback(
    (next: Q.QueueState, start: boolean) =>
      onPlayer(async () => {
        const { tracks, index } = Q.playOrder(next, { isOnline: isOnlineRef.current });
        const keys = keysOf(tracks);
        const held = playerRef.current;
        if (held.keys.length === 0 && !start) return;
        await ensureTrackPlayerInitialized();

        if (tracks.length === 0) {
          await TrackPlayer.reset();
        } else if (sameKeys(held.keys, keys)) {
          if (held.index !== index) await TrackPlayer.skip(index);
          if (start) await TrackPlayer.play();
        } else if (start || held.keys[held.index] !== keys[index]) {
          await TrackPlayer.setQueue(tracks.map(toNativeTrack));
          if (index > 0) await TrackPlayer.skip(index);
          await TrackPlayer.play();
        } else if (sameKeys(held.keys.slice(0, held.index + 1), keys.slice(0, index + 1))) {
          await TrackPlayer.removeUpcomingTracks();
          const after = tracks.slice(index + 1);
          if (after.length > 0) await TrackPlayer.add(after.map(toNativeTrack));
        } else {
          const others = held.keys.map((_, i) => i).filter((i) => i !== held.index);
          if (others.length > 0) await TrackPlayer.remove(others);
          const before = tracks.slice(0, index);
          if (before.length > 0) await TrackPlayer.add(before.map(toNativeTrack), 0);
          const after = tracks.slice(index + 1);
          if (after.length > 0) await TrackPlayer.add(after.map(toNativeTrack));
        }
        playerRef.current = { keys, index };
      }),
    [onPlayer],
  );

  // Synchronize audio player queue whenever network status toggles
  useEffect(() => {
    if (queueRef.current.current) {
      applyToPlayer(queueRef.current, false);
    }
  }, [isOnline, applyToPlayer]);

  // Every queue change goes through here: screens, the saved copy, and the audio player
  const commit = useCallback(
    (next: Q.QueueState, player: "apply" | "start" | "follow" = "apply") => {
      queueRef.current = next;
      setQueue(next);
      if (player !== "follow") applyToPlayer(next, player === "start");
    },
    [applyToPlayer, setQueue],
  );

  // Follows the audio player when it moves on by itself: a song ending, the lock screen,
  // headphone buttons. Reads its position after any queued player calls have finished
  const followPlayer = useCallback(
    () =>
      onPlayer(async () => {
        const index = await TrackPlayer.getActiveTrackIndex();
        if (index === undefined || index === playerRef.current.index) return;
        playerRef.current = { ...playerRef.current, index };
        const next = Q.moveTo(queueRef.current, index, isOnlineRef.current);
        if (next !== queueRef.current) {
          commit(next, "follow");
          incrementedRef.current = false;
          const track = next.current?.track;
          if (
            track &&
            isMirloTrack(track) &&
            typeof track.id === "number" &&
            (await isPlaybackLimitReached(track.id, track.trackGroup?.artist?.maxFreePlays))
          ) {
            await stopDisabledTrack(track.id);
          }
        }
      }),
    [onPlayer, commit],
  );

  // Restores the saved queue. If the player is still holding that queue (the app's screens
  // were rebuilt while music played), pick up where it is
  useEffect(() => {
    getDownloadedTracks();
    const raw = kvStorage.getString("nimue.queue");
    const saved = Q.fromSaved(raw ?? null);
    queueRef.current = saved;
    setQueue(saved);
    (async () => {
      await onPlayer(async () => {
        await ensureTrackPlayerInitialized();
        const held = keysOf((await TrackPlayer.getQueue()) as RNTrack[]);
        if (held.length === 0) return;
        if (sameKeys(held, keysOf(Q.playOrder(saved).tracks))) {
          playerRef.current = { keys: held, index: Q.playOrder(saved).index };
        } else {
          await TrackPlayer.reset();
        }
      });
      followPlayer();
    })();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") followPlayer();
    });
    return () => subscription.remove();
  }, [onPlayer, followPlayer]);

  // A deleted download leaves the queue, so the player never reaches a missing file
  useEffect(
    () =>
      subscribeDownloads((saved) => {
        const urls = new Set(saved.map((d) => d.url));
        const deleted = (t: RNTrack) => !!t.url?.startsWith("file://") && !urls.has(t.url);
        const next = Q.removeWhere(queueRef.current, deleted);
        if (Q.allTracks(next).length !== Q.allTracks(queueRef.current).length) commit(next);
      }),
    [commit],
  );

  const activeTrack = queue.current?.track;

  useTrackPlayerEvents(
    [
      Event.PlaybackActiveTrackChanged,
      Event.PlaybackProgressUpdated,
      Event.PlaybackError,
    ],
    async (event) => {
      if (event.type === Event.PlaybackError) {
        const currentTrack = queueRef.current.current?.track;
        const isFaircampError = Boolean(
          currentTrack?.fairplayerTrackId ||
            currentTrack?.source === "Faircamp" ||
            currentTrack?.trackGroup?.source === "Faircamp",
        );
        const isPaymentError =
          event.message?.includes("Track play limit exceeded") ||
          event.message?.includes("402") ||
          event.message?.toLowerCase().includes("payment required") ||
          (event as any).code === "402" ||
          (event as any).code === 402;

        if (isFaircampError) blockFaircampDomain(currentTrack?.sourceUrl || currentTrack?.url);
        if (isFaircampError || isPaymentError) {
          await stopDisabledTrack(typeof currentTrack?.id === "number" ? currentTrack.id : undefined);
          return;
        }
      }

      if (event.type === Event.PlaybackActiveTrackChanged) {
        resetRadioTimer();
        followPlayer();
        return;
      }

      if (event.type === Event.PlaybackProgressUpdated) {
        const progressRatio = event.duration > 0 ? event.position / event.duration : 0;
        if (progressRatio < 0.05) {
          incrementedRef.current = false;
        }

        if (!incrementedRef.current && progressRatio >= 0.5) {
          incrementedRef.current = true;
          const currentTrack = queueRef.current.current?.track;
          const targetId = currentTrack?.id;

          if (
            isMirloTrack(currentTrack) &&
            typeof targetId === "number" &&
            Number.isInteger(targetId) &&
            targetId > 0
          ) {
            await recordTrackPlay(
              targetId,
              currentTrack?.trackGroup?.artist?.maxFreePlays,
            );
            try {
              await api.get(`/v1/tracks/${targetId}/trackPlay`, {});
            } catch (error) {
              console.error("Failed to record track play:", error);
            }
          }
        }
      }
    },
  );

  const isPlaying =
    playBackState.state === State.Playing ||
    playBackState.state === State.Buffering ||
    playBackState.state === State.Loading;

  latest.current = { isPlaying, shuffled, looping, disabledTrackIds };

  const togglePlayPause = useCallback(async () => {
    try {
      await ensureTrackPlayerInitialized();
      if (latest.current.isPlaying) {
        await TrackPlayer.pause();
      } else if (playerRef.current.keys.length === 0 && queueRef.current.current) {
        // A queue restored from the last session loads into the player on first play
        await applyToPlayer(queueRef.current, true);
      } else {
        await TrackPlayer.play();
      }
    } catch (err) {
      console.error("Toggle playback error:", err);
    }
  }, [applyToPlayer]);

  const playTrack = useCallback(
    async (track: RNTrack, albumTracks?: RNTrack[], source?: string) => {
      try {
        if (isMirloTrack(track) && track.id) {
          if (trackDisabled(track.id) || isTrackDisabledSync(Number(track.id))) {
            await TrackPlayer.pause();
            return;
          }
          if (await isPlaybackLimitReached(track.id, track.trackGroup?.artist?.maxFreePlays)) {
            await TrackPlayer.pause();
            return;
          }
        }

        const state = queueRef.current;

        // A song from the album already in Next Up plays from there
        if (!albumTracks || albumTracks.length === 0) {
          const index = state.nextUp.findIndex((t) => isSameTrack(t, track));
          if (index !== -1) {
            commit(Q.playFromUpcoming(state, index), "start");
            return;
          }
        }

        const enriched = toPlayerTrack(track);
        const candidates = albumTracks && albumTracks.length > 0 ? albumTracks : [track];
        const raw = candidates.filter((t) => !(t.id && trackDisabled(t.id)));
        if (raw.length === 0) return;

        let targetIndex = raw.findIndex(
          (t) =>
            (track.id !== undefined && t.id === track.id) ||
            (track.url && t.url === track.url) ||
            (track.title && t.title === track.title),
        );
        if (targetIndex === -1) {
          targetIndex = typeof track.queueIndex === "number" ? track.queueIndex : 0;
        }
        targetIndex = Math.min(Math.max(0, targetIndex), raw.length - 1);

        const playlist = raw.map((t) =>
          toPlayerTrack(t, { artwork: enriched.artwork, artist: enriched.artist }),
        );

        // The same song from the same list is already loaded: carry on playing it
        const current = state.current?.track;
        const playingSame =
          current &&
          isSameTrack(current, playlist[targetIndex]) &&
          state.sourceOrder.length === playlist.length &&
          playlist.every((t, i) => isSameTrack(t, state.sourceOrder[i]));
        if (playingSame) {
          if (!latest.current.isPlaying) await togglePlayPause();
          return;
        }

        const ordered = latest.current.shuffled
          ? [playlist[targetIndex], ...shuffle(playlist.filter((_, i) => i !== targetIndex))]
          : playlist;
        const startIndex = latest.current.shuffled ? 0 : targetIndex;
        const nextSource = source || track.trackGroup?.title || "";
        commit(Q.play(state, ordered, startIndex, nextSource, playlist), "start");
      } catch (err) {
        console.error("Play track error:", err);
      }
    },
    [commit, trackDisabled, togglePlayPause],
  );

  // Queued songs are the listener's picks, even when they started out as previews
  const addToQueue = useCallback(
    async (track: RNTrack) => {
      if (track.id && trackDisabled(track.id)) return;
      commit(Q.addToQueue(queueRef.current, toPlayerTrack(track)));
    },
    [commit, trackDisabled],
  );

  const removeFromUserQueue = useCallback(
    async (index: number) => commit(Q.removeFromQueue(queueRef.current, index)),
    [commit],
  );

  const clearUserQueue = useCallback(async () => commit(Q.clearQueue(queueRef.current)), [commit]);

  const playFromUserQueue = useCallback(
    async (index: number) => commit(Q.playFromQueue(queueRef.current, index), "start"),
    [commit],
  );

  const skipToUpcoming = useCallback(
    async (index: number) => commit(Q.playFromUpcoming(queueRef.current, index), "start"),
    [commit],
  );

  const moveQueueItem = useCallback(
    async (from: QueueSlot, to: QueueSlot) => commit(Q.moveItem(queueRef.current, from, to)),
    [commit],
  );

  // Discovery maintains 12 songs: whenever a song is taken from the discovery queue, one is added
  useEffect(() => {
    if (!isOnline || looping !== "none" || !queue.current) return;
    if (queue.discovery.length >= DISCOVERY_BUFFER_SIZE) return;

    const generation = queue.generation;
    const known = Q.allTracks(queue);
    const knownIds = new Set(known.map((t) => t.id).filter((id): id is string | number => id !== undefined));
    const knownUrls = new Set(known.map((t) => t.url).filter(Boolean));

    // 1. Instant synchronous draw from the local reservoir to maintain exactly 12 songs
    const needed = DISCOVERY_BUFFER_SIZE - queue.discovery.length;
    const drawn = drawFromReservoir(needed, knownIds, knownUrls);
    if (drawn.length > 0) {
      const next = Q.addDiscovery(
        queueRef.current,
        drawn.map((t) => toPlayerTrack(t)),
        generation,
      );
      if (next !== queueRef.current) commit(next);
    }

    // 2. Quiet background replenishment of reservoir if below target capacity
    (async () => {
      try {
        const fresh = await replenishDiscoveryReservoir(knownIds, knownUrls);
        if (queueRef.current.discovery.length < DISCOVERY_BUFFER_SIZE && fresh.length > 0) {
          const directNeeded = DISCOVERY_BUFFER_SIZE - queueRef.current.discovery.length;
          const direct = fresh
            .slice(0, directNeeded)
            .map((t) => toPlayerTrack(t))
            .filter((t) => !knownIds.has(t.id) && (!t.url || !knownUrls.has(t.url)));
          const next = Q.addDiscovery(queueRef.current, direct, generation);
          if (next !== queueRef.current) commit(next);
        }
      } catch (err) {
        console.warn("Autoplay replenishment error:", err);
      }
    })();
  }, [queue, looping, commit, isOnline]);

  const toggleShuffle = useCallback(async () => {
    const on = !latest.current.shuffled;
    setShuffled(on);
    commit(Q.shuffleNextUp(queueRef.current, on, shuffle));
  }, [commit]);

  const cycleRepeat = useCallback(async () => {
    const { looping } = latest.current;
    const next: RepeatSetting = queueRef.current.current?.track.liveStation
      ? looping === "track"
        ? "none"
        : "track"
      : REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(looping) + 1) % REPEAT_CYCLE.length];
    try {
      await ensureTrackPlayerInitialized();
      await TrackPlayer.setRepeatMode(REPEAT_MODES[next]);
      setLooping(next);
      // Repeating loops what you chose, so Discovery steps aside
      if (next !== "none") commit(Q.clearDiscovery(queueRef.current));
    } catch (err) {
      console.error("Repeat mode error:", err);
    }
  }, [commit]);

  const skipNext = useCallback(async () => {
    const next = Q.advance(queueRef.current);
    if (next !== queueRef.current) commit(next, "start");
  }, [commit]);

  const skipPrevious = useCallback(async () => {
    try {
      await ensureTrackPlayerInitialized();
      const progress = await TrackPlayer.getProgress();
      const state = queueRef.current;
      if (progress.position > 3 || state.history.length === 0) {
        await TrackPlayer.seekTo(0);
        return;
      }
      commit(Q.back(state), "start");
    } catch (err) {
      console.error("Skip previous error:", err);
    }
  }, [commit]);

  const seekTo = useCallback(async (position: number) => {
    try {
      await ensureTrackPlayerInitialized();
      await TrackPlayer.seekTo(position);
    } catch (err) {
      console.error("Seek error:", err);
    }
  }, []);

  const userQueue = queue.userQueue;
  const upcoming = useMemo(() => Q.upcoming(queue), [queue]);

  const value: PlayerContextType = useMemo(
    () => ({
      queueSource: queue.source,
      userQueue,
      upcoming,
      addToQueue,
      removeFromUserQueue,
      clearUserQueue,
      moveQueueItem,
      playFromUserQueue,
      skipToUpcoming,
      activeTrack,
      shuffled,
      toggleShuffle,
      isPlaying,
      looping,
      cycleRepeat,
      playTrack,
      togglePlayPause,
      skipNext,
      skipPrevious,
      seekTo,
      disabledTrackIds,
      isTrackDisabled,
    }),
    [
      queue.source,
      userQueue,
      upcoming,
      addToQueue,
      removeFromUserQueue,
      clearUserQueue,
      moveQueueItem,
      playFromUserQueue,
      skipToUpcoming,
      activeTrack,
      shuffled,
      toggleShuffle,
      isPlaying,
      looping,
      cycleRepeat,
      playTrack,
      togglePlayPause,
      skipNext,
      skipPrevious,
      seekTo,
      disabledTrackIds,
      isTrackDisabled,
    ],
  );

  const [store] = useState(() => createStore(value));
  useLayoutEffect(() => store.set(value), [store, value]);

  return <PlayerContext.Provider value={store}>{children}</PlayerContext.Provider>;
};

// The player fields a component shows, e.g. usePlayer("isPlaying", "togglePlayPause").
// The component redraws only when one of those fields changes
export function usePlayer<K extends keyof PlayerContextType>(...keys: K[]): Pick<PlayerContextType, K> {
  const store = useContext(PlayerContext);
  if (!store) {
    throw new Error("usePlayer must be used within a PlayerContextProvider");
  }
  return store.usePick(...keys);
}
