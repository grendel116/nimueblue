// The player host: the one place that owns the queue and the audio player. Screens send it
// requests and show the state it sends back. It gives the audio player the full play order from
// the current song onward, follows the player when a song ends, refills Discovery, and saves
// the queue. In the Android app it runs on the phone side, next to the audio player; in a
// browser it runs in the page
import TrackPlayer, { Event, RepeatMode, State } from "react-native-track-player";
import * as Q from "./queueModel";
import { ensureTrackPlayerInitialized } from "./setup";
import { isSameTrack, toNativeTrack, toPlayerTrack } from "./trackUtils";
import { REPEAT_CYCLE, type QueueSlot, type RepeatSetting } from "./types";
import { kvStorage } from "@/scripts/storage/kvStorage";
import { isMirloTrack, shuffle } from "@/scripts/utils";
import * as api from "@/queries/fetch/fetchWrapper";
import {
  drawFromReservoir,
  replenishDiscoveryReservoir,
  DISCOVERY_BUFFER_SIZE,
} from "@/scripts/autoplay";
import {
  findDownload,
  getDownloadedTracks,
  subscribeDownloads,
  updateDownloadedTracks,
} from "@/scripts/downloadManager";
import {
  getTrackPlayCounts,
  isPlaybackLimitReached,
  isTrackDisabledSync,
  markTrackDisabled,
  mergePlayCounts,
  playCountsSync,
  recordTrackPlay,
  subscribePlayCounts,
} from "@/scripts/trackPlayUtils";

export const QUEUE_KEY = "nimue.queue";

export type PlayerSnapshot = {
  activeTrack?: RNTrack;
  userQueue: RNTrack[];
  upcoming: RNTrack[];
  queueSource: string;
  shuffled: boolean;
  looping: RepeatSetting;
  playCounts: Record<number, number>;
};

export type HostMessage =
  | { type: "state"; snapshot: PlayerSnapshot }
  | { type: "faircampError"; url?: string };

export type PlayerRequest =
  | { type: "refresh" }
  | { type: "setOnline"; online: boolean }
  | { type: "playTrack"; track: RNTrack; albumTracks?: RNTrack[]; source?: string }
  | { type: "togglePlayPause" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "skipNext" }
  | { type: "skipPrevious" }
  | { type: "seekTo"; position: number }
  | { type: "addToQueue"; track: RNTrack }
  | { type: "removeFromUserQueue"; index: number }
  | { type: "clearUserQueue" }
  | { type: "moveQueueItem"; from: QueueSlot; to: QueueSlot }
  | { type: "playFromUserQueue"; index: number }
  | { type: "skipToUpcoming"; index: number }
  | { type: "toggleShuffle" }
  | { type: "cycleRepeat" }
  | { type: "removeKeys"; keys: string[] }
  | { type: "handoff"; savedQueue?: string; playCounts?: Record<number, number> };

// What screens talk to: the host itself, or the bridge to it from inside the Android app
export interface PlayerConnection {
  request: (request: PlayerRequest) => Promise<void>;
  subscribe: (listener: (message: HostMessage) => void) => () => void;
  snapshot: () => PlayerSnapshot;
}

export interface PlayerHost extends PlayerConnection {
  dispose: () => void;
}

const PLAYING_STATES = new Set<string>([State.Playing, State.Buffering, State.Loading]);

const isOnPhone = (track: RNTrack) =>
  Boolean(track.url?.startsWith("file://") || track.url?.startsWith("content://") || findDownload(track));

const maxFreePlaysOf = (track: RNTrack) => track.trackGroup?.artist?.maxFreePlays;

const sameKeys = (a: string[], b: string[]) =>
  a.length === b.length && a.every((k, i) => k === b[i]);

function upcomingFromCurrent(state: Q.QueueState, isOnline: boolean): RNTrack[] {
  if (!state.current) return [];
  return [
    state.current.track,
    ...state.userQueue,
    ...state.nextUp,
    ...(isOnline ? state.discovery : []),
  ];
}

export function createPlayerHost(): PlayerHost {
  let queue = Q.fromSaved(kvStorage.getString(QUEUE_KEY) ?? null);
  let shuffled = false;
  let looping: RepeatSetting = "none";
  let online = true;
  let replenishing = false;
  let countedPlay = false;
  let applying = 0;
  let held: { keys: string[]; index: number } = { keys: [], index: -1 };
  const listeners = new Set<(message: HostMessage) => void>();
  let chain: Promise<void> = Promise.resolve();

  const snapshot = (): PlayerSnapshot => ({
    activeTrack: queue.current?.track,
    userQueue: queue.userQueue,
    upcoming: Q.upcoming(queue),
    queueSource: queue.source,
    shuffled,
    looping,
    playCounts: playCountsSync(),
  });
  const tell = (message: HostMessage) => listeners.forEach((listener) => listener(message));
  const announce = () => tell({ type: "state", snapshot: snapshot() });

  // Requests and player events run one at a time, in the order they arrive
  const run = (work: () => Promise<void>) => {
    const next = chain.then(work).catch((err) => console.error("Player error:", err));
    chain = next;
    return next;
  };

  // The queue once the current song is done: the next song in play order, or back to the
  // start of the history when repeating all
  const following = (state: Q.QueueState): Q.QueueState => {
    const next = Q.advance(state, 1, online);
    if (next !== state) return next;
    if (looping === "queue" && state.history.length > 0) return Q.moveTo(state, 0, online);
    return state;
  };

  // Draws from the local Discovery reservoir synchronously so commits happen in one step
  function withReservoirDiscovery(state: Q.QueueState): Q.QueueState {
    if (!online || looping !== "none" || !state.current) return state;
    const needed = DISCOVERY_BUFFER_SIZE - state.discovery.length;
    if (needed <= 0) return state;
    const known = Q.allTracks(state);
    const knownIds = new Set(known.map((t) => t.id).filter((id): id is number => id !== undefined));
    const knownUrls = new Set(known.map((t) => t.url).filter(Boolean));
    const drawn = drawFromReservoir(needed, knownIds, knownUrls);
    if (drawn.length === 0) return state;
    return Q.addDiscovery(
      state,
      drawn.map((t) => toPlayerTrack(t)),
      state.generation,
    );
  }

  // Synchronizes the audio player with the queue's play order without reloading the song playing.
  // When skipping to a song already in the player, a single skip() call switches immediately
  async function syncPlayer(play: boolean) {
    applying += 1;
    try {
      await ensureTrackPlayerInitialized();
      const wanted = upcomingFromCurrent(queue, online);
      if (wanted.length === 0) {
        if (held.keys.length > 0) {
          await TrackPlayer.reset();
          held = { keys: [], index: -1 };
        }
        return;
      }
      if (held.keys.length === 0 && !play) return;

      const wantedKeys = wanted.map((t) => t._queueKey || "");
      const currentKey = wantedKeys[0];
      const targetInHeld =
        held.index >= 0 && held.keys[held.index] === currentKey
          ? held.index
          : held.index >= 0 && held.keys[held.index + 1] === currentKey
            ? held.index + 1
            : held.index > 0 && held.keys[held.index - 1] === currentKey
              ? held.index - 1
              : held.keys.lastIndexOf(currentKey);

      if (targetInHeld === -1) {
        await TrackPlayer.setQueue(wanted.map(toNativeTrack));
        if (play) await TrackPlayer.play();
        held = { keys: wantedKeys, index: 0 };
        return;
      }

      if (targetInHeld !== held.index) {
        await TrackPlayer.skip(targetInHeld);
      }

      const heldAfter = held.keys.slice(targetInHeld + 1);
      const wantedAfter = wantedKeys.slice(1);
      if (!sameKeys(heldAfter, wantedAfter)) {
        if (
          heldAfter.length < wantedAfter.length &&
          sameKeys(heldAfter, wantedAfter.slice(0, heldAfter.length))
        ) {
          const added = wanted.slice(1 + heldAfter.length);
          await TrackPlayer.add(added.map(toNativeTrack));
        } else {
          if (heldAfter.length > 0) await TrackPlayer.removeUpcomingTracks();
          const after = wanted.slice(1);
          if (after.length > 0) await TrackPlayer.add(after.map(toNativeTrack));
        }
      }

      held = {
        keys: [...held.keys.slice(0, targetInHeld + 1), ...wantedAfter],
        index: targetInHeld,
      };
      if (play) await TrackPlayer.play();
    } finally {
      applying -= 1;
    }
  }

  // Every queue change lands here: Discovery topped up from reservoir, saved, announced to
  // screens immediately, and then synced to the audio player
  async function commit(next: Q.QueueState, play = false) {
    queue = withReservoirDiscovery(next);
    kvStorage.set(QUEUE_KEY, Q.toSaved(queue));
    announce();
    if (play || held.keys.length > 0) await syncPlayer(play);
    replenishReservoir();
  }

  async function stopDisabledTrack(trackId?: number) {
    await TrackPlayer.pause();
    if (typeof trackId === "number" && trackId > 0) await markTrackDisabled(trackId);
  }

  // When the audio player advances on its own as a song finishes, the queue moves on with it
  async function followPlayer() {
    if (applying > 0 || !queue.current) return;
    await ensureTrackPlayerInitialized();
    const [active, activeIndex] = await Promise.all([
      TrackPlayer.getActiveTrack() as Promise<RNTrack | undefined>,
      TrackPlayer.getActiveTrackIndex(),
    ]);
    const key = active?._queueKey;
    if (!key || key === queue.current.track._queueKey) return;

    const upcoming = upcomingFromCurrent(queue, online);
    const steps = upcoming.findIndex((t) => t._queueKey === key);
    if (steps <= 0) return;

    if (typeof activeIndex === "number" && activeIndex >= 0) {
      held = { ...held, index: activeIndex };
    } else if (held.keys[held.index + steps] === key) {
      held = { ...held, index: held.index + steps };
    }
    countedPlay = false;
    await commit(Q.advance(queue, steps, online), false);
    const track = queue.current?.track;
    if (
      track &&
      !isOnPhone(track) &&
      isMirloTrack(track) &&
      typeof track.id === "number" &&
      (await isPlaybackLimitReached(track.id, maxFreePlaysOf(track)))
    ) {
      await stopDisabledTrack(track.id);
    }
  }

  // Quietly stocks the background Discovery reservoir from the network
  function replenishReservoir() {
    if (!online || looping !== "none" || !queue.current || replenishing) return;
    const generation = queue.generation;
    const known = Q.allTracks(queue);
    const knownIds = new Set(known.map((t) => t.id).filter((id): id is number => id !== undefined));
    const knownUrls = new Set(known.map((t) => t.url).filter(Boolean));

    replenishing = true;
    replenishDiscoveryReservoir(knownIds, knownUrls)
      .then((fresh) => {
        if (fresh.length === 0) return;
        return run(async () => {
          if (generation !== queue.generation || queue.discovery.length >= DISCOVERY_BUFFER_SIZE) return;
          const wanted = fresh.slice(0, DISCOVERY_BUFFER_SIZE - queue.discovery.length);
          const next = Q.addDiscovery(queue, wanted.map((t) => toPlayerTrack(t)), generation);
          if (next !== queue) await commit(next);
        });
      })
      .catch((err) => console.warn("Discovery refill error:", err))
      .finally(() => {
        replenishing = false;
      });
  }

  async function togglePlayPause() {
    await ensureTrackPlayerInitialized();
    const { state } = await TrackPlayer.getPlaybackState();
    if (PLAYING_STATES.has(state)) {
      await TrackPlayer.pause();
    } else {
      await play();
    }
  }

  // A queue restored from the last session loads into the audio player on first play
  async function play() {
    await ensureTrackPlayerInitialized();
    if (held.keys.length === 0 && queue.current) await syncPlayer(true);
    else await TrackPlayer.play();
  }

  async function playTrack(track: RNTrack, albumTracks?: RNTrack[], source?: string) {
    if (!isOnPhone(track) && isMirloTrack(track) && typeof track.id === "number") {
      if (isTrackDisabledSync(track.id) || (await isPlaybackLimitReached(track.id, maxFreePlaysOf(track)))) {
        await TrackPlayer.pause();
        return;
      }
    }

    // A song from the album already in Next Up plays from there
    if (!albumTracks || albumTracks.length === 0) {
      const index = queue.nextUp.findIndex((t) => isSameTrack(t, track));
      if (index !== -1) {
        countedPlay = false;
        await commit(Q.playFromUpcoming(queue, index), true);
        return;
      }
    }

    const enriched = toPlayerTrack(track);
    const candidates = albumTracks && albumTracks.length > 0 ? albumTracks : [track];
    const raw = candidates.filter(
      (t) => isOnPhone(t) || !(typeof t.id === "number" && isTrackDisabledSync(t.id)),
    );
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
    const current = queue.current?.track;
    const playingSame =
      current &&
      isSameTrack(current, playlist[targetIndex]) &&
      queue.sourceOrder.length === playlist.length &&
      playlist.every((t, i) => isSameTrack(t, queue.sourceOrder[i]));
    if (playingSame) {
      const { state } = await TrackPlayer.getPlaybackState();
      if (!PLAYING_STATES.has(state)) await play();
      return;
    }

    const ordered = shuffled
      ? [playlist[targetIndex], ...shuffle(playlist.filter((_, i) => i !== targetIndex))]
      : playlist;
    const startIndex = shuffled ? 0 : targetIndex;
    const nextSource = source || track.trackGroup?.title || "";
    countedPlay = false;
    await commit(Q.play(queue, ordered, startIndex, nextSource, playlist), true);
  }

  async function handle(request: PlayerRequest) {
    switch (request.type) {
      case "refresh":
        if (held.keys.length > 0) await followPlayer();
        announce();
        return;
      case "setOnline":
        if (online === request.online) return;
        online = request.online;
        await commit(queue);
        return;
      case "playTrack":
        await playTrack(request.track, request.albumTracks, request.source);
        return;
      case "togglePlayPause":
        await togglePlayPause();
        return;
      case "play":
        await play();
        return;
      case "pause":
        await TrackPlayer.pause();
        return;
      case "skipNext": {
        const next = following(queue);
        if (next !== queue) {
          countedPlay = false;
          await commit(next, true);
        }
        return;
      }
      case "skipPrevious": {
        const progress = await TrackPlayer.getProgress();
        if (progress.position > 3 || queue.history.length === 0) {
          await TrackPlayer.seekTo(0);
          return;
        }
        countedPlay = false;
        await commit(Q.back(queue), true);
        return;
      }
      case "seekTo":
        await TrackPlayer.seekTo(request.position);
        return;
      case "addToQueue": {
        const track = request.track;
        if (!isOnPhone(track) && typeof track.id === "number" && isTrackDisabledSync(track.id)) return;
        await commit(Q.addToQueue(queue, toPlayerTrack(track)));
        return;
      }
      case "removeFromUserQueue":
        await commit(Q.removeFromQueue(queue, request.index));
        return;
      case "clearUserQueue":
        await commit(Q.clearQueue(queue));
        return;
      case "moveQueueItem":
        await commit(Q.moveItem(queue, request.from, request.to));
        return;
      case "playFromUserQueue":
        countedPlay = false;
        await commit(Q.playFromQueue(queue, request.index), true);
        return;
      case "skipToUpcoming":
        countedPlay = false;
        await commit(Q.playFromUpcoming(queue, request.index), true);
        return;
      case "toggleShuffle":
        shuffled = !shuffled;
        await commit(Q.shuffleNextUp(queue, shuffled, shuffle));
        return;
      case "cycleRepeat": {
        // A live station only switches between off and repeat one
        const next: RepeatSetting = queue.current?.track.liveStation
          ? looping === "track"
            ? "none"
            : "track"
          : REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(looping) + 1) % REPEAT_CYCLE.length];
        await TrackPlayer.setRepeatMode(next === "track" ? RepeatMode.Track : RepeatMode.Off);
        looping = next;
        // Repeating loops what you chose, so Discovery steps aside
        await commit(next !== "none" ? Q.clearDiscovery(queue) : queue);
        return;
      }
      case "removeKeys": {
        const keys = new Set(request.keys);
        await commit(Q.removeWhere(queue, (t) => Boolean(t._queueKey && keys.has(t._queueKey))));
        return;
      }
      case "handoff":
        if (request.playCounts) await mergePlayCounts(request.playCounts);
        if (!queue.current && request.savedQueue) await commit(Q.fromSaved(request.savedQueue));
        return;
    }
  }

  // Counts a play once half the song has been heard, and records the duration of any saved song
  // that was missing one
  const onProgress = async ({ position, duration }: { position: number; duration: number }) => {
    const track = queue.current?.track;
    if (track && duration > 0 && Number.isFinite(duration)) {
      const dl = findDownload(track);
      if (dl && (!dl.duration || dl.duration <= 0)) {
        const rounded = Math.round(duration);
        updateDownloadedTracks([dl.id], { duration: rounded }).catch(() => {});
      }
    }
    const ratio = duration > 0 ? position / duration : 0;
    if (ratio < 0.05) countedPlay = false;
    if (countedPlay || ratio < 0.5) return;
    countedPlay = true;
    const id = track?.id;
    if (!track || isOnPhone(track) || !isMirloTrack(track)) return;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return;
    await recordTrackPlay(id, maxFreePlaysOf(track));
    try {
      await api.get(`/v1/tracks/${id}/trackPlay`, {});
    } catch (error) {
      console.error("Failed to record track play:", error);
    }
  };

  // A Faircamp song that won't load, or a song needing payment, is paused and disabled
  const onError = (event: { message?: string; code?: string | number }) => {
    const track = queue.current?.track;
    const isFaircamp = Boolean(
      track?.fairplayerTrackId || track?.source === "Faircamp" || track?.trackGroup?.source === "Faircamp",
    );
    const needsPayment =
      event.message?.includes("Track play limit exceeded") ||
      event.message?.includes("402") ||
      event.message?.toLowerCase().includes("payment required") ||
      String(event.code) === "402";
    if (isFaircamp) tell({ type: "faircampError", url: track?.sourceUrl || track?.url });
    if (track && !isOnPhone(track) && (isFaircamp || needsPayment)) {
      run(() => stopDisabledTrack(typeof track.id === "number" ? track.id : undefined));
    }
  };

  const subscriptions = [
    TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => {
      if (applying === 0) run(followPlayer);
    }),
    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, onProgress),
    TrackPlayer.addEventListener(Event.PlaybackError, onError as any),
    // When the last song finishes under repeat all, wrap back to the first song (or restart a single song)
    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
      run(async () => {
        if (looping !== "queue" || !queue.current) return;
        if (queue.history.length > 0) {
          countedPlay = false;
          await commit(Q.moveTo(queue, 0, online), true);
        } else {
          await TrackPlayer.seekTo(0);
          await TrackPlayer.play();
        }
      });
    }),
  ];

  // A deleted download leaves the queue, and edited downloads update their metadata/URLs in place
  const stopDownloads = subscribeDownloads((saved) => {
    const urls = new Set(saved.map((d) => d.url).filter(Boolean));
    const byId = new Map(saved.map((d) => [d.id, d]));
    const isLocalUrl = (url?: string) =>
      Boolean(url?.startsWith("file://") || url?.startsWith("content://"));
    const deleted = (t: RNTrack) =>
      isLocalUrl(t.url) && !urls.has(t.url) && (t.id === undefined || !byId.has(t.id));
    const syncTrackMeta = (t: RNTrack): { track: RNTrack; changed: boolean } => {
      const dl = t.id !== undefined ? byId.get(t.id) : undefined;
      if (!dl) return { track: t, changed: false };
      const nextTitle = dl.title || t.title;
      const nextArtist = dl.artist || t.artist;
      const nextUrl = dl.url || t.url;
      const nextAlbumTitle = dl.albumTitle || t.trackGroup?.title;
      if (
        nextTitle === t.title &&
        nextArtist === t.artist &&
        nextUrl === t.url &&
        nextAlbumTitle === t.trackGroup?.title
      ) {
        return { track: t, changed: false };
      }
      return {
        changed: true,
        track: {
          ...t,
          title: nextTitle,
          artist: nextArtist,
          url: nextUrl,
          audio: t.audio ? { ...t.audio, url: nextUrl } : t.audio,
          trackGroup: t.trackGroup
            ? {
                ...t.trackGroup,
                title: nextAlbumTitle || t.trackGroup.title,
                artist: t.trackGroup.artist
                  ? { ...t.trackGroup.artist, name: nextArtist }
                  : ({ name: nextArtist } as Artist),
              }
            : t.trackGroup,
        },
      };
    };

    run(async () => {
      let next = Q.removeWhere(queue, deleted);
      let metaChanged = false;
      const mapList = (list: RNTrack[]) =>
        list.map((t) => {
          const res = syncTrackMeta(t);
          if (res.changed) metaChanged = true;
          return res.track;
        });
      const currentRes = next.current ? syncTrackMeta(next.current.track) : undefined;
      if (currentRes?.changed) metaChanged = true;
      const nextUserQueue = mapList(next.userQueue);
      const nextUp = mapList(next.nextUp);
      const nextHistory = next.history.map((h) => {
        const res = syncTrackMeta(h.track);
        if (res.changed) metaChanged = true;
        return res.changed ? { ...h, track: res.track } : h;
      });
      const nextSourceOrder = mapList(next.sourceOrder);
      if (metaChanged) {
        next = {
          ...next,
          current: next.current && currentRes ? { ...next.current, track: currentRes.track } : next.current,
          userQueue: nextUserQueue,
          nextUp,
          history: nextHistory,
          sourceOrder: nextSourceOrder,
        };
      }
      if (metaChanged || Q.allTracks(next).length !== Q.allTracks(queue).length) {
        await commit(next);
      }
    });
  });
  const stopCounts = subscribePlayCounts(announce);

  getDownloadedTracks();
  getTrackPlayCounts().then(announce);
  // An audio player still holding songs (the phone side restarted) is brought in line
  run(async () => {
    await ensureTrackPlayerInitialized();
    const tracks = (await TrackPlayer.getQueue()) as RNTrack[];
    if (tracks.length > 0) {
      const index = (await TrackPlayer.getActiveTrackIndex()) ?? 0;
      held = { keys: tracks.map((t) => t._queueKey || ""), index };
      await followPlayer();
      await syncPlayer(false);
    }
  });

  return {
    request: (request) => run(() => handle(request)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot,
    dispose: () => {
      subscriptions.forEach((s) => s.remove());
      stopDownloads();
      stopCounts();
      listeners.clear();
    },
  };
}

let host: PlayerHost | undefined;

// The one host for this side of the app
export function getPlayerHost(): PlayerHost {
  if (!host) host = createPlayerHost();
  return host;
}
