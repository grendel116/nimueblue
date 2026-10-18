import {
  incrementPlayCount,
  reachedMaxPlays,
  getDisabledTrackIds,
  markTrackDisabled,
  subscribeDisabledTracks,
  isTrackDisabledSync,
} from "@/scripts/trackPlayUtils";
import {
  createContext,
  useState,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  IOSCategory,
  IOSCategoryOptions,
  usePlaybackState,
  useTrackPlayerEvents,
  RepeatMode,
  State,
  TrackType,
} from "react-native-track-player";
import { isTrackOwned, audioTrackType, resolveArtworkUrl } from "@/scripts/utils";
import { API_ROOT } from "@/constants/api-root";
import { API_KEY } from "@/constants/api-key";
import * as api from "../queries/fetch/fetchWrapper";
import { fetchDiscoveryTracks } from "@/scripts/autoplay";
import { blockFaircampDomain } from "@/queries/fairplayer";
import { findDownload, getDownloadedTracks, subscribeDownloads } from "@/scripts/downloadManager";
import { resetRadioTimer } from "@/scripts/radioTimer";

// Autoplay tops up when fewer than this many previews wait after the playlist
const AUTOPLAY_THRESHOLD = 2;
const AUTOPLAY_ALBUMS_PER_BATCH = 5;

// The repeat button cycles off → repeat all → repeat one
export type RepeatSetting = "none" | "queue" | "track";
const REPEAT_CYCLE: RepeatSetting[] = ["none", "queue", "track"];
const REPEAT_MODES: Record<RepeatSetting, RepeatMode> = {
  none: RepeatMode.Off,
  queue: RepeatMode.Queue,
  track: RepeatMode.Track,
};

// Fisher-Yates: every order equally likely
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Same track: by Mirlo id when both have one, otherwise by stream URL
function isSameTrack(a: RNTrack, b: RNTrack): boolean {
  if (a.id !== undefined && b.id !== undefined) return a.id === b.id;
  return Boolean(a.url) && a.url === b.url;
}

// Your Queue is the run of queued songs right after the one playing
function queuedCount(after: RNTrack[]): number {
  const firstOther = after.findIndex((t) => !t.queued);
  return firstOther === -1 ? after.length : firstOther;
}

// The player's list, the song playing, and how many queued songs wait after it
async function readPlayer() {
  const queue = (await TrackPlayer.getQueue()) as RNTrack[];
  const active = (await TrackPlayer.getActiveTrackIndex()) ?? -1;
  return { queue, active, queued: queuedCount(queue.slice(active + 1)) };
}

const setupPlayerOptions = {
  autoHandleInterruptions: true,
  iosCategory: IOSCategory.Playback,
  iosCategoryOptions: [
    IOSCategoryOptions.AllowAirPlay,
    IOSCategoryOptions.AllowBluetoothA2DP,
  ],
};

const updatePlayerOptions = {
  android: {
    appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
  },
  capabilities: [
    Capability.Play,
    Capability.Pause,
    Capability.SkipToNext,
    Capability.SkipToPrevious,
    Capability.SeekTo,
  ],
  compactCapabilities: [
    Capability.Play,
    Capability.Pause,
    Capability.SkipToNext,
    Capability.SkipToPrevious,
  ],
  notificationCapabilities: [
    Capability.Play,
    Capability.Pause,
    Capability.SkipToNext,
    Capability.SkipToPrevious,
    Capability.SeekTo,
  ],
  progressUpdateEventInterval: 2,
};

let playerSetupPromise: Promise<void> | null = null;

function isAlreadyInitializedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.toLowerCase().includes("already") &&
    message.toLowerCase().includes("initial")
  );
}

export async function ensureTrackPlayerInitialized(): Promise<void> {
  if (!playerSetupPromise) {
    playerSetupPromise = (async () => {
      try {
        await TrackPlayer.setupPlayer(setupPlayerOptions);
      } catch (error) {
        if (!isAlreadyInitializedError(error)) {
          throw error;
        }
      }
      await TrackPlayer.updateOptions(updatePlayerOptions);
    })().catch((error) => {
      playerSetupPromise = null;
      throw error;
    });
  }
  return playerSetupPromise;
}

function resolveStreamUrl(rawAudio: string): string {
  if (!rawAudio) return "";
  if (/^(https?|file):\/\//.test(rawAudio)) return rawAudio;
  const path = rawAudio.startsWith("/") ? rawAudio : `/${rawAudio}`;
  if (API_ROOT && API_ROOT !== "/" && path.startsWith(`${API_ROOT}/`)) return path;
  return `${API_ROOT}${path}`;
}

let nextQueueKeyId = 1;

// Prepares any track for the player: absolute stream URL, API key header, artwork, and artist.
// A song saved on the phone plays from its file instead of streaming
function toPlayerTrack(
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

  let cleanTrackGroup: RNTrack["trackGroup"] = undefined;
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

export type QueueSection = "queue" | "upcoming";
export type QueueSlot = { section: QueueSection; index: number };

export interface PlayerContextType {
  // Tracks currently loaded in the player, and the name of where they came from
  playingQueue: RNTrack[];
  queueSource: string;
  // Your Queue, then the rest of what's coming up
  userQueue: RNTrack[];
  upcoming: RNTrack[];
  addToQueue: (track: RNTrack) => Promise<void>;
  removeFromUserQueue: (index: number) => Promise<void>;
  clearUserQueue: () => Promise<void>;
  moveQueueItem: (from: QueueSlot, to: QueueSlot) => Promise<void>;
  playFromUserQueue: (index: number) => Promise<void>;
  skipToUpcoming: (index: number) => Promise<void>;
  activeTrack: RNTrack | undefined;
  setActiveTrack: (track: RNTrack) => void;
  shuffled: boolean;
  toggleShuffle: () => Promise<void>;
  isPlaying: boolean;
  looping: RepeatSetting;
  cycleRepeat: () => Promise<void>;
  // Centralized transport actions
  playTrack: (track: RNTrack, albumTracks?: RNTrack[], source?: string) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  disabledTrackIds: Set<number>;
  isTrackDisabled: (trackId?: number) => boolean;
}

type PlayerStore = {
  get: () => PlayerContextType;
  set: (value: PlayerContextType) => void;
  subscribe: (listener: () => void) => () => void;
};

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
  const user: LoggedInUser | null = null;
  const userRef = useRef(user);
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
    user,
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

  // The same check for actions, against the latest state
  const trackDisabled = useCallback(
    (trackId?: number) =>
      typeof trackId === "number" &&
      (latest.current.disabledTrackIds.has(trackId) || isTrackDisabledSync(trackId)),
    [],
  );

  const activeTrackOwnedRef = useRef<boolean>(false);
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
        if (track.id && trackDisabled(track.id) && !isTrackOwned(track, track.trackGroup, latest.current.user)) {
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
        // A queued song plays now; the rest of Your Queue follows it
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
        activeTrackOwnedRef.current = isTrackOwned(fullTrack, fullTrack.trackGroup, userRef.current);
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

  useEffect(() => {
    activeTrackOwnedRef.current = false;
    activeTrackIdRef.current = null;
  }, [user]);

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
        const targetId = activeTrackIdRef.current ?? currentTrack?.id;
        const isFaircampError = Boolean(
          currentTrack?.fairplayerTrackId ||
            currentTrack?.source === "Faircamp" ||
            currentTrack?.trackGroup?.source === "Faircamp",
        );

        if (isFaircampError) {
          blockFaircampDomain(currentTrack?.sourceUrl || currentTrack?.url);
          await TrackPlayer.pause();
          if (typeof targetId === "number" && targetId > 0) {
            await markTrackDisabled(targetId);
            setDisabledTrackIds((prev) => new Set(prev).add(targetId));
          }
          return;
        }

        if (
          event.message?.includes("Track play limit exceeded") ||
          event.message?.includes("402") ||
          event.message?.toLowerCase().includes("payment required") ||
          (event as any).code === "402" ||
          (event as any).code === 402
        ) {
          await TrackPlayer.pause();
          if (typeof targetId === "number" && targetId > 0) {
            await markTrackDisabled(targetId);
            setDisabledTrackIds((prev) => new Set(prev).add(targetId));
          }
          return;
        }
      }

      if (event.type === Event.PlaybackActiveTrackChanged) {
        resetRadioTimer();
        const rawTrack = ((event as any).track ??
          (await TrackPlayer.getActiveTrack())) as RNTrack | undefined;
        if (rawTrack) {
          const idx = event.index ?? -1;
          const queueTrack =
            (typeof idx === "number" && idx >= 0 && latest.current.playingQueue[idx]) ||
            latest.current.playingQueue.find((t) => isSameTrack(t, rawTrack));
          const track = queueTrack
            ? { ...rawTrack, ...queueTrack, url: queueTrack.url || rawTrack.url }
            : rawTrack;
          setActiveTrack(track);
          setActiveIndex(idx);
          const owned = isTrackOwned(track, track.trackGroup, userRef.current);
          activeTrackOwnedRef.current = owned;
          activeTrackIdRef.current = track.id ?? null;
          incrementedRef.current = false;

          const isExternal = Boolean(
            track.fairplayerTrackId ||
              track.liveStation ||
              track.podcastEpisodeId ||
              (track.source && !String(track.source).toLowerCase().startsWith("mirlo")),
          );
          if (
            !owned &&
            !isExternal &&
            typeof track.id === "number" &&
            (isTrackDisabledSync(track.id) ||
              (await reachedMaxPlays(track.id, track.trackGroup?.artist?.maxFreePlays)))
          ) {
            await TrackPlayer.pause();
            setDisabledTrackIds((prev) => new Set(prev).add(track.id));
          }
        }
        return;
      }

      if (
        !activeTrackOwnedRef.current &&
        event.type === Event.PlaybackProgressUpdated
      ) {
        const progressRatio = event.duration > 0 ? event.position / event.duration : 0;
        if (progressRatio < 0.05) {
          incrementedRef.current = false;
        }

        if (!incrementedRef.current && progressRatio >= 0.5) {
          incrementedRef.current = true;
          const currentTrack = (await TrackPlayer.getActiveTrack()) as RNTrack | undefined;
          const targetId = activeTrackIdRef.current ?? currentTrack?.id;

          const isExternalTrack = Boolean(
            currentTrack?.fairplayerTrackId ||
              currentTrack?.liveStation ||
              currentTrack?.podcastEpisodeId ||
              (currentTrack?.source &&
                !String(currentTrack.source).toLowerCase().startsWith("mirlo")),
          );

          // Issue #67 fix: Strictly guard track ID to ensure it is a valid integer before telemetry
          if (
            !isExternalTrack &&
            typeof targetId === "number" &&
            Number.isInteger(targetId) &&
            targetId > 0
          ) {
            await incrementPlayCount(
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
    user,
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
        const { activeTrack, playingQueue, activeIndex, isPlaying, shuffled, user } = latest.current;

        const isExternal = Boolean(
          track.fairplayerTrackId ||
            track.liveStation ||
            track.podcastEpisodeId ||
            (track.source && !String(track.source).toLowerCase().startsWith("mirlo")),
        );

        // Pause and disable guard: Do not stream tracks whose preview limits or HTTP 402 were reached
        if (
          !isExternal &&
          track.id &&
          (trackDisabled(track.id) ||
            (await reachedMaxPlays(track.id, track.trackGroup?.artist?.maxFreePlays))) &&
          !isTrackOwned(track, track.trackGroup, user)
        ) {
          await TrackPlayer.pause();
          return;
        }

        const isSameAlbum =
          activeTrack &&
          Boolean(track.trackGroup?.urlSlug) &&
          activeTrack.trackGroup?.urlSlug === track.trackGroup?.urlSlug &&
          playingQueue.length > 0;

        // Only skip within current queue if no fresh custom album/playlist tracks list was provided
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

        // New album or new playlist: load fresh queue, excluding any disabled unowned tracks
        const candidateTracks =
          albumTracks && albumTracks.length > 0 ? albumTracks : [track];
        const rawTracks = candidateTracks.filter(
          (t) =>
            !(t.id && trackDisabled(t.id) && !isTrackOwned(t, t.trackGroup, user)),
        );
        if (rawTracks.length === 0) return;

        // The picked song is already playing from this same list: keep it going
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

        // Find the clicked track by id, url, or title
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

        // Shuffle on: the clicked track plays first, the rest follow in random order
        playlistOrderRef.current = playlist;
        const ordered = shuffled
          ? [playlist[targetIndex], ...shuffle(playlist.filter((_, i) => i !== targetIndex))]
          : playlist;
        const startIndex = shuffled ? 0 : targetIndex;

        // Your Queue stays next in line after the song just picked
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

  // Moves a track within or between "Your Queue" and "Next Up"
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

        // A dragged song is the listener's pick, so it no longer counts as a preview
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

  // Keeps playback going: discovery previews always wait after the playlist, topped up as they play
  useEffect(() => {
    if (looping !== "none" || !activeTrack || playingQueue.length === 0) return;
    const activeIdx = playingQueue.findIndex((t) => isSameTrack(t, activeTrack));
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
        // Draw again when a random batch only holds songs already queued
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
        setPlayingQueue((prev) => [...prev, ...added]);
      } catch (err) {
        console.error("Autoplay error:", err);
      } finally {
        autoplayFillingRef.current = false;
        if (generation !== queueGenerationRef.current) setAutoplayRecheck((n) => n + 1);
      }
    })();
  }, [activeTrack, playingQueue, looping, autoplayRecheck]);

  // Shuffle reorders the playlist songs still coming up. Turning it off puts them back in
  // playlist order; queued songs keep their place at the end, and previews always follow
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

  // Repeat cycles off → repeat all → repeat one, using the player's own repeat mode so it
  // also works from the lock screen and when a song ends on its own. On a station it toggles
  // off ↔ repeat one, which keeps the station on past its 10-minute set. Repeat loops only the
  // listener's songs: previews leave the queue (except one already playing), and come back
  // when repeat is off
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
        // Drop any preview batch still loading so it doesn't land in the loop
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

  const [store] = useState(() => createPlayerStore(value));
  useLayoutEffect(() => store.set(value), [store, value]);

  return <PlayerContext.Provider value={store}>{children}</PlayerContext.Provider>;
};

// Holds the player's latest value and tells subscribed components when it changes
function createPlayerStore(initial: PlayerContextType): PlayerStore {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (next) => {
      current = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// The player fields a component shows, e.g. usePlayer("isPlaying", "togglePlayPause").
// The component redraws only when one of those fields changes
export function usePlayer<K extends keyof PlayerContextType>(...keys: K[]): Pick<PlayerContextType, K> {
  const store = useContext(PlayerContext);
  if (!store) {
    throw new Error("usePlayer must be used within a PlayerContextProvider");
  }
  const picked = useRef<Pick<PlayerContextType, K> | undefined>(undefined);
  const pick = () => {
    const value = store.get();
    const previous = picked.current;
    if (previous && keys.every((key) => Object.is(previous[key], value[key]))) return previous;
    const next = {} as Pick<PlayerContextType, K>;
    for (const key of keys) next[key] = value[key];
    picked.current = next;
    return next;
  };
  return useSyncExternalStore(store.subscribe, pick);
}
