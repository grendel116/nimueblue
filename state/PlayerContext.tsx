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
import { fetchDiscoveryTracks } from "@/scripts/autoplay";
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
import {
  isSameTrack,
  queuedCount,
  readPlayer,
  toPlayerTrack,
} from "./player/trackUtils";

export type { RepeatSetting, QueueSection, QueueSlot, PlayerContextType };
export { ensureTrackPlayerInitialized };

const AUTOPLAY_THRESHOLD = 2;
const AUTOPLAY_ALBUMS_PER_BATCH = 5;

type PlayerStore = Store<PlayerContextType>;

// Carries a store that never changes identity; components subscribe through usePlayer
export const PlayerContext = createContext<PlayerStore | null>(null);

export const PlayerContextProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [shuffled, setShuffled] = useState<boolean>(false);
  const [looping, setLooping] = useState<RepeatSetting>("none");
  const [playingQueue, setPlayingQueue] = useState<RNTrack[]>([]);
  const [queueSource, setQueueSource] = useState<string>("");
  const [activeTrack, setActiveTrack] = useState<RNTrack>();
  const [activeIndex, setActiveIndex] = useState(-1);
  const playBackState = usePlaybackState();
  const incrementedRef = useRef(false);
  const [disabledTrackIds, setDisabledTrackIds] = useState<Set<number>>(new Set());

  // The player's state as of the last render. Actions read it when they run, so each action
  // keeps one identity and starting a track doesn't redraw every screen holding a button
  const latest = useRef({
    activeTrack: undefined as RNTrack | undefined,
    playingQueue: [] as RNTrack[],
    activeIndex: -1,
    isPlaying: false,
    shuffled: false,
    looping: "none" as RepeatSetting,
    disabledTrackIds,
  });

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

  const activeTrackIdRef = useRef<number | null>(null);
  const queueGenerationRef = useRef(0);
  const autoplayFillingRef = useRef(false);
  const [autoplayRecheck, setAutoplayRecheck] = useState(0);
  // The playlist in its own order, so turning shuffle off can put it back
  const playlistOrderRef = useRef<RNTrack[]>([]);

  // Your Queue lives in the player's own list, right after the song playing, so the next
  // song is always a queued one: when a song ends, on Next, and from the lock screen
  const { userQueue, upcoming } = useMemo(() => {
    const after = activeIndex >= 0 ? playingQueue.slice(activeIndex + 1) : [];
    const queued = queuedCount(after);
    return { userQueue: after.slice(0, queued), upcoming: after.slice(queued) };
  }, [playingQueue, activeIndex]);

  const refreshQueue = useCallback(async () => {
    const { queue, active } = await readPlayer();
    setPlayingQueue(queue);
    setActiveIndex(active);
  }, []);

  // Queued songs are the listener's picks, even when they started out as previews
  const addToQueue = useCallback(
    async (track: RNTrack) => {
      try {
        await ensureTrackPlayerInitialized();
        if (track.id && trackDisabled(track.id)) {
          return;
        }
        const { queue, active, queued } = await readPlayer();
        const prepared = toPlayerTrack({ ...track, autoplay: undefined, queued: true });
        const insertAt = active + 1 + queued;
        if (insertAt < queue.length) await TrackPlayer.add(prepared, insertAt);
        else await TrackPlayer.add(prepared);
        await refreshQueue();
      } catch (err) {
        console.error("Add to queue error:", err);
      }
    },
    [refreshQueue, trackDisabled],
  );

  const removeFromUserQueue = useCallback(
    async (index: number) => {
      try {
        const { active, queued } = await readPlayer();
        if (index < 0 || index >= queued) return;
        await TrackPlayer.remove(active + 1 + index);
        await refreshQueue();
      } catch (err) {
        console.error("Remove from queue error:", err);
      }
    },
    [refreshQueue],
  );

  const clearUserQueue = useCallback(async () => {
    try {
      const { active, queued } = await readPlayer();
      if (queued === 0) return;
      await TrackPlayer.remove(Array.from({ length: queued }, (_, i) => active + 1 + i));
      await refreshQueue();
    } catch (err) {
      console.error("Clear queue error:", err);
    }
  }, [refreshQueue]);

  // Plays the song at `target` in the player's list while Your Queue stays next in line
  const jumpTo = useCallback(
    async (target: number) => {
      const { queue, active, queued } = await readPlayer();
      const first = active + 1;
      if (target >= first && target < first + queued) {
        if (target !== first) await TrackPlayer.move(target, first);
        await TrackPlayer.skip(first);
      } else {
        const waiting = queue.slice(first, first + queued);
        if (queued > 0) await TrackPlayer.remove(waiting.map((_, i) => first + i));
        await TrackPlayer.skip(target > active ? target - queued : target);
        if (queued > 0) {
          const now = (await TrackPlayer.getActiveTrackIndex()) ?? 0;
          const length = (await TrackPlayer.getQueue()).length;
          if (now + 1 < length) await TrackPlayer.add(waiting, now + 1);
          else await TrackPlayer.add(waiting);
        }
      }
      await TrackPlayer.play();
      await refreshQueue();
    },
    [refreshQueue],
  );

  // The native player keeps playing while the app is in the background, and Android can
  // rebuild the app's screens from scratch. Read the queue, track, and repeat mode back
  // from the player whenever the app starts or returns to the front
  const syncFromPlayer = useCallback(async () => {
    try {
      await ensureTrackPlayerInitialized();
      const [queue, track, mode] = await Promise.all([
        TrackPlayer.getQueue() as Promise<RNTrack[]>,
        TrackPlayer.getActiveTrack() as Promise<RNTrack | undefined>,
        TrackPlayer.getRepeatMode(),
      ]);
      const activeIdx = (await TrackPlayer.getActiveTrackIndex()) ?? -1;
      setActiveIndex(activeIdx);
      if (playlistOrderRef.current.length === 0) playlistOrderRef.current = queue;
      if (track) {
        const queueTrack =
          (activeIdx >= 0 && queue[activeIdx]) ||
          queue.find((t) => isSameTrack(t, track));
        const fullTrack = queueTrack
          ? { ...track, ...queueTrack, url: queueTrack.url || track.url }
          : track;
        setActiveTrack(fullTrack);
        activeTrackIdRef.current = fullTrack.id ?? null;
      }
      setLooping(REPEAT_CYCLE.find((setting) => REPEAT_MODES[setting] === mode) ?? "none");
    } catch (err) {
      console.error("Track Player sync error:", err);
    }
  }, []);

  useEffect(() => {
    getDownloadedTracks();
    syncFromPlayer();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") syncFromPlayer();
    });
    return () => subscription.remove();
  }, [syncFromPlayer]);

  // A deleted download leaves the queue, so the player never reaches a missing file
  useEffect(
    () =>
      subscribeDownloads(async (saved) => {
        const urls = new Set(saved.map((d) => d.url));
        const deleted = (t: RNTrack) => !!t.url?.startsWith("file://") && !urls.has(t.url);
        playlistOrderRef.current = playlistOrderRef.current.filter((t) => !deleted(t));
        try {
          const queue = (await TrackPlayer.getQueue()) as RNTrack[];
          const gone = queue.flatMap((t, index) => (deleted(t) ? [index] : []));
          if (gone.length === 0) return;
          await TrackPlayer.remove(gone);
          await refreshQueue();
        } catch (err) {
          console.error("Queue cleanup error:", err);
        }
      }),
    [refreshQueue],
  );

  useTrackPlayerEvents(
    [
      Event.PlaybackActiveTrackChanged,
      Event.PlaybackProgressUpdated,
      Event.PlaybackError,
    ],
    async (event) => {
      if (event.type === Event.PlaybackError) {
        const currentTrack =
          activeTrack ?? ((await TrackPlayer.getActiveTrack()) as RNTrack | undefined);
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
          await stopDisabledTrack(activeTrackIdRef.current ?? currentTrack?.id);
          return;
        }
      }

      if (event.type === Event.PlaybackActiveTrackChanged) {
        resetRadioTimer();
        const rawTrack = ((event as any).track ??
          (await TrackPlayer.getActiveTrack())) as RNTrack | undefined;
        if (rawTrack) {
          const idx = event.index ?? -1;
          const currentQueue = latest.current.playingQueue;
          const candidate =
            typeof idx === "number" && idx >= 0 && idx < currentQueue.length
              ? currentQueue[idx]
              : undefined;
          const queueTrack =
            (candidate && isSameTrack(candidate, rawTrack))
              ? candidate
              : currentQueue.find((t) => isSameTrack(t, rawTrack));
          const track = queueTrack
            ? { ...rawTrack, ...queueTrack, url: queueTrack.url || rawTrack.url }
            : rawTrack;
          setActiveTrack(track);
          setActiveIndex(idx);
          latest.current = {
            ...latest.current,
            activeTrack: track,
            activeIndex: idx,
          };
          activeTrackIdRef.current = track.id ?? null;
          incrementedRef.current = false;

          if (
            isMirloTrack(track) &&
            typeof track.id === "number" &&
            (await isPlaybackLimitReached(track.id, track.trackGroup?.artist?.maxFreePlays))
          ) {
            await stopDisabledTrack(track.id);
          }
        }
        return;
      }

      if (event.type === Event.PlaybackProgressUpdated) {
        const progressRatio = event.duration > 0 ? event.position / event.duration : 0;
        if (progressRatio < 0.05) {
          incrementedRef.current = false;
        }

        if (!incrementedRef.current && progressRatio >= 0.5) {
          incrementedRef.current = true;
          const currentTrack = (await TrackPlayer.getActiveTrack()) as RNTrack | undefined;
          const targetId = activeTrackIdRef.current ?? currentTrack?.id;

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

  latest.current = {
    activeTrack,
    playingQueue,
    activeIndex,
    isPlaying,
    shuffled,
    looping,
    disabledTrackIds,
  };

  const togglePlayPause = useCallback(async () => {
    try {
      await ensureTrackPlayerInitialized();
      if (latest.current.isPlaying) {
        await TrackPlayer.pause();
      } else {
        await TrackPlayer.play();
      }
    } catch (err) {
      console.error("Toggle playback error:", err);
    }
  }, []);

  const playTrack = useCallback(
    async (track: RNTrack, albumTracks?: RNTrack[], source?: string) => {
      try {
        const nextSource = source || track.trackGroup?.title || "";

        await ensureTrackPlayerInitialized();
        const { activeTrack, playingQueue, activeIndex, isPlaying, shuffled } = latest.current;

        if (
          isMirloTrack(track) &&
          track.id &&
          (trackDisabled(track.id) ||
            (await isPlaybackLimitReached(track.id, track.trackGroup?.artist?.maxFreePlays)))
        ) {
          await TrackPlayer.pause();
          return;
        }

        const isSameAlbum =
          activeTrack &&
          Boolean(track.trackGroup?.urlSlug) &&
          activeTrack.trackGroup?.urlSlug === track.trackGroup?.urlSlug &&
          playingQueue.length > 0;

        if (isSameAlbum && (!albumTracks || albumTracks.length === 0)) {
          const indexInQueue = playingQueue.findIndex(
            (t) =>
              (track.id !== undefined && t.id === track.id) ||
              (track.url && t.url === track.url)
          );
          if (indexInQueue !== -1) {
            await jumpTo(indexInQueue);
            return;
          }
        }

        const enrichedTrack = toPlayerTrack(track);
        const resolvedArtwork = enrichedTrack.artwork;
        const enrichedArtist = enrichedTrack.artist;

        const candidateTracks =
          albumTracks && albumTracks.length > 0 ? albumTracks : [track];
        const rawTracks = candidateTracks.filter(
          (t) => !(t.id && trackDisabled(t.id)),
        );
        if (rawTracks.length === 0) return;

        const loaded = playlistOrderRef.current;
        if (
          activeTrack &&
          isSameTrack(activeTrack, track) &&
          rawTracks.length === loaded.length &&
          rawTracks.every((t, i) => isSameTrack(t, loaded[i]))
        ) {
          if (!isPlaying) await TrackPlayer.play();
          return;
        }

        const playlist = rawTracks.map((t) =>
          toPlayerTrack(t, { artwork: resolvedArtwork, artist: enrichedArtist }),
        );

        let targetIndex = rawTracks.findIndex(
          (t) =>
            (track.id !== undefined && t.id === track.id) ||
            (track.url && t.url === track.url) ||
            (track.title && t.title === track.title)
        );
        if (targetIndex === -1) {
          targetIndex = typeof track.queueIndex === "number" ? track.queueIndex : 0;
        }
        targetIndex = Math.min(Math.max(0, targetIndex), playlist.length - 1);

        playlistOrderRef.current = playlist;
        const ordered = shuffled
          ? [playlist[targetIndex], ...shuffle(playlist.filter((_, i) => i !== targetIndex))]
          : playlist;
        const startIndex = shuffled ? 0 : targetIndex;

        const afterLoaded = activeIndex >= 0 ? playingQueue.slice(activeIndex + 1) : [];
        const waiting = afterLoaded.slice(0, queuedCount(afterLoaded));
        const tracksToLoad = [
          ...ordered.slice(0, startIndex + 1),
          ...waiting,
          ...ordered.slice(startIndex + 1),
        ];

        setActiveTrack(ordered[startIndex]);
        setPlayingQueue(tracksToLoad);
        setActiveIndex(startIndex);
        latest.current = {
          ...latest.current,
          activeTrack: ordered[startIndex],
          playingQueue: tracksToLoad,
          activeIndex: startIndex,
        };
        queueGenerationRef.current += 1;
        setQueueSource(nextSource);

        await TrackPlayer.setQueue(tracksToLoad);
        if (startIndex > 0) {
          await TrackPlayer.skip(startIndex);
        }
        await TrackPlayer.play();
      } catch (err) {
        console.error("Play track error:", err);
      }
    },
    [jumpTo, trackDisabled],
  );

  const playFromUserQueue = useCallback(
    async (index: number) => {
      try {
        await ensureTrackPlayerInitialized();
        const { active } = await readPlayer();
        await jumpTo(active + 1 + index);
      } catch (err) {
        console.error("Play from queue error:", err);
      }
    },
    [jumpTo],
  );

  const skipToUpcoming = useCallback(
    async (index: number) => {
      try {
        await ensureTrackPlayerInitialized();
        const { active, queued } = await readPlayer();
        await jumpTo(active + 1 + queued + index);
      } catch (err) {
        console.error("Skip to upcoming error:", err);
      }
    },
    [jumpTo],
  );

  const moveQueueItem = useCallback(
    async (from: QueueSlot, to: QueueSlot) => {
      if (from.section === to.section && from.index === to.index) return;
      setPlayingQueue((prev) => {
        const { activeIndex } = latest.current;
        if (activeIndex < 0) return prev;
        const first = activeIndex + 1;
        const after = prev.slice(first);
        const queued = queuedCount(after);
        const fromAt = first + (from.section === "queue" ? 0 : queued) + from.index;
        const track = prev[fromAt];
        if (!track) return prev;
        const next = [...prev];
        next.splice(fromAt, 1);
        const moved = toPlayerTrack({ ...track, autoplay: undefined, queued: to.section === "queue" });
        const queuedLeft = queued - (from.section === "queue" ? 1 : 0);
        const toAt = first + (to.section === "queue" ? 0 : queuedLeft) + to.index;
        next.splice(toAt, 0, moved);
        return next;
      });
      try {
        await ensureTrackPlayerInitialized();
        const { queue, active, queued } = await readPlayer();
        const first = active + 1;
        const fromAt = first + (from.section === "queue" ? 0 : queued) + from.index;
        const track = queue[fromAt];
        if (!track) return;
        await TrackPlayer.remove(fromAt);

        const moved = toPlayerTrack({ ...track, autoplay: undefined, queued: to.section === "queue" });
        const queuedLeft = queued - (from.section === "queue" ? 1 : 0);
        const toAt = first + (to.section === "queue" ? 0 : queuedLeft) + to.index;
        if (toAt < queue.length - 1) await TrackPlayer.add(moved, toAt);
        else await TrackPlayer.add(moved);
        await refreshQueue();
      } catch (err) {
        console.error("Move queue item error:", err);
      }
    },
    [refreshQueue],
  );

  useEffect(() => {
    if (looping !== "none" || !activeTrack || playingQueue.length === 0) return;
    const activeIdx =
      activeIndex >= 0 &&
      activeIndex < playingQueue.length &&
      isSameTrack(playingQueue[activeIndex], activeTrack)
        ? activeIndex
        : playingQueue.findIndex((t) => isSameTrack(t, activeTrack));
    if (activeIdx < 0) return;
    const upcomingPreviews = playingQueue.slice(activeIdx + 1).filter((t) => t.autoplay).length;
    if (upcomingPreviews >= AUTOPLAY_THRESHOLD) return;
    if (autoplayFillingRef.current) return;

    autoplayFillingRef.current = true;
    const generation = queueGenerationRef.current;
    const knownIds = new Set(playingQueue.map((t) => t.id).filter((id) => id !== undefined));
    const knownUrls = new Set(playingQueue.map((t) => t.url).filter(Boolean));

    (async () => {
      try {
        let added: RNTrack[] = [];
        for (let attempt = 0; attempt < 3 && added.length === 0; attempt++) {
          const batch = await fetchDiscoveryTracks(AUTOPLAY_ALBUMS_PER_BATCH);
          if (batch.length === 0) break;
          added = batch
            .map((t) => toPlayerTrack(t))
            .filter((t) => !knownIds.has(t.id) && (!t.url || !knownUrls.has(t.url)));
        }
        if (added.length === 0 || generation !== queueGenerationRef.current) return;

        await TrackPlayer.add(added);
        latest.current = {
          ...latest.current,
          playingQueue: [...latest.current.playingQueue, ...added],
        };
        setPlayingQueue((prev) => [...prev, ...added]);
      } catch (err) {
        console.error("Autoplay error:", err);
      } finally {
        autoplayFillingRef.current = false;
        if (generation !== queueGenerationRef.current) setAutoplayRecheck((n) => n + 1);
      }
    })();
  }, [activeTrack, playingQueue, activeIndex, looping, autoplayRecheck]);

  const toggleShuffle = useCallback(async () => {
    try {
      await ensureTrackPlayerInitialized();
      const { shuffled, playingQueue } = latest.current;
      const nextShuffled = !shuffled;
      setShuffled(nextShuffled);

      const activeIndex = await TrackPlayer.getActiveTrackIndex();
      if (activeIndex === undefined) return;
      const played = playingQueue.slice(0, activeIndex + 1);
      const after = playingQueue.slice(activeIndex + 1);
      const waiting = after.slice(0, queuedCount(after));
      const rest = after.slice(waiting.length);
      const songs = rest.filter((t) => !t.autoplay);
      const previews = rest.filter((t) => t.autoplay);
      if (songs.length < 2) return;

      let reordered: RNTrack[];
      if (nextShuffled) {
        reordered = shuffle(songs);
      } else {
        const order = playlistOrderRef.current;
        const position = (t: RNTrack) => {
          const i = order.findIndex((o) => isSameTrack(o, t));
          return i === -1 ? Number.MAX_SAFE_INTEGER : i;
        };
        reordered = [...songs].sort((a, b) => position(a) - position(b));
      }
      const upcomingOrder = [...waiting, ...reordered, ...previews];

      await TrackPlayer.removeUpcomingTracks();
      await TrackPlayer.add(upcomingOrder);
      setPlayingQueue([...played, ...upcomingOrder]);
    } catch (err) {
      console.error("Shuffle error:", err);
    }
  }, []);

  const cycleRepeat = useCallback(async () => {
    const { activeTrack, looping, playingQueue } = latest.current;
    const next: RepeatSetting = activeTrack?.liveStation
      ? looping === "track"
        ? "none"
        : "track"
      : REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(looping) + 1) % REPEAT_CYCLE.length];
    try {
      await ensureTrackPlayerInitialized();
      await TrackPlayer.setRepeatMode(REPEAT_MODES[next]);
      setLooping(next);

      if (next !== "none") {
        queueGenerationRef.current += 1;
        const activeIndex = (await TrackPlayer.getActiveTrackIndex()) ?? -1;
        const previewIndexes = playingQueue
          .map((t, i) => (i !== activeIndex && t.autoplay ? i : -1))
          .filter((i) => i >= 0);
        if (previewIndexes.length > 0) {
          await TrackPlayer.remove(previewIndexes);
          await refreshQueue();
        }
      }
    } catch (err) {
      console.error("Repeat mode error:", err);
    }
  }, [refreshQueue]);

  const skipNext = useCallback(async () => {
    try {
      await ensureTrackPlayerInitialized();
      const queue = await TrackPlayer.getQueue();
      const trackIndex = await TrackPlayer.getActiveTrackIndex();
      if (queue.length === 0 || trackIndex === undefined) return;

      if (trackIndex >= queue.length - 1) {
        await TrackPlayer.skip(0);
      } else {
        await TrackPlayer.skipToNext();
      }
    } catch (err) {
      console.error("Skip next error:", err);
    }
  }, []);

  const skipPrevious = useCallback(async () => {
    try {
      await ensureTrackPlayerInitialized();
      const progress = await TrackPlayer.getProgress();
      if (progress.position > 3) {
        await TrackPlayer.seekTo(0);
        return;
      }

      const queue = await TrackPlayer.getQueue();
      const trackIndex = await TrackPlayer.getActiveTrackIndex();
      if (queue.length === 0 || trackIndex === undefined) return;

      if (trackIndex === 0) {
        await TrackPlayer.skip(queue.length - 1);
      } else {
        await TrackPlayer.skipToPrevious();
      }
    } catch (err) {
      console.error("Skip previous error:", err);
    }
  }, []);

  const seekTo = useCallback(async (position: number) => {
    try {
      await ensureTrackPlayerInitialized();
      await TrackPlayer.seekTo(position);
    } catch (err) {
      console.error("Seek error:", err);
    }
  }, []);

  const value: PlayerContextType = useMemo(
    () => ({
      playingQueue,
      queueSource,
      userQueue,
      upcoming,
      addToQueue,
      removeFromUserQueue,
      clearUserQueue,
      moveQueueItem,
      playFromUserQueue,
      skipToUpcoming,
      activeTrack,
      setActiveTrack,
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
      playingQueue,
      queueSource,
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
