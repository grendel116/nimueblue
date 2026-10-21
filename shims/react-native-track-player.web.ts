import Hls from "hls.js/dist/hls.min.js";

export enum State {
  None = "none",
  Ready = "ready",
  Playing = "playing",
  Paused = "paused",
  Stopped = "stopped",
  Loading = "loading",
  Buffering = "buffering",
  Error = "error",
  Ended = "ended",
}

export enum Event {
  PlayerError = "player-error",
  PlaybackState = "playback-state",
  PlaybackError = "playback-error",
  PlaybackQueueEnded = "playback-queue-ended",
  PlaybackActiveTrackChanged = "playback-active-track-changed",
  PlaybackPlayWhenReadyChanged = "playback-play-when-ready-changed",
  PlaybackProgressUpdated = "playback-progress-updated",
  RemotePlay = "remote-play",
  RemotePause = "remote-pause",
  RemoteStop = "remote-stop",
  RemoteNext = "remote-next",
  RemotePrevious = "remote-previous",
  RemoteSeek = "remote-seek",
  RemoteDuck = "remote-duck",
}

export enum Capability {
  Play,
  Pause,
  Stop,
  SeekTo,
  Skip,
  SkipToNext,
  SkipToPrevious,
}

export enum IOSCategory {
  Playback = "playback",
}

export enum IOSCategoryOptions {
  AllowAirPlay = "allowAirPlay",
  AllowBluetoothA2DP = "allowBluetoothA2DP",
}

export enum AppKilledPlaybackBehavior {
  ContinuePlayback = "continue-playback",
  PausePlayback = "pause-playback",
  StopPlaybackAndRemoveNotification = "stop-playback-and-remove-notification",
}

export enum TrackType {
  Default = "default",
  Dash = "dash",
  HLS = "hls",
  SmoothStreaming = "smoothstreaming",
}

export enum RepeatMode {
  Off,
  Track,
  Queue,
}

export type PlaybackState = { state: State };

let queue: any[] = [];
let activeIndex = 0;
let currentState: State = State.None;
let shouldPlay = false;
let loadedUrl = "";
let repeatMode: RepeatMode = RepeatMode.Off;
const listeners = new Set<(event: any) => void>();
let audioElement: HTMLAudioElement | null = null;
let hlsInstance: Hls | null = null;
let latestProgress = {
  position: 0,
  duration: 0,
  buffered: 0,
};

function isWebViewBridge(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).ReactNativeWebView);
}

function postToNative(type: string, payload: Record<string, any> = {}) {
  if (isWebViewBridge()) {
    (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
  }
}

if (typeof window !== "undefined") {
  const onNativeMessage = (event: any) => {
    try {
      let raw = event.data;
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch {
          return;
        }
      }
      if (!raw || typeof raw !== "object" || !raw.type) return;

      switch (raw.type) {
        case Event.PlaybackState:
          currentState = raw.state;
          emit(Event.PlaybackState, { state: raw.state });
          break;
        case Event.PlaybackActiveTrackChanged:
          if (typeof raw.index === "number") {
            activeIndex = raw.index;
          }
          if (raw.track && queue[activeIndex]) {
            queue[activeIndex] = raw.track;
          }
          emit(Event.PlaybackActiveTrackChanged, {
            track: raw.track || queue[activeIndex],
            index: activeIndex,
          });
          break;
        case Event.PlaybackProgressUpdated:
          latestProgress = {
            position: raw.position ?? 0,
            duration: raw.duration ?? 0,
            buffered: raw.buffered ?? 0,
          };
          emit(Event.PlaybackProgressUpdated, latestProgress);
          break;
        case Event.PlaybackQueueEnded:
          currentState = State.Ended;
          emit(Event.PlaybackQueueEnded);
          break;
        case Event.PlaybackError:
          currentState = State.Error;
          emit(Event.PlaybackError, { message: raw.message, code: raw.code });
          break;
        case "sync":
          if (raw.state) {
            currentState = raw.state;
            emit(Event.PlaybackState, { state: raw.state });
          }
          if (Array.isArray(raw.queue)) {
            queue = [...raw.queue];
          }
          const prevIndex = activeIndex;
          const prevTrack = queue[prevIndex];
          if (typeof raw.activeIndex === "number") {
            activeIndex = raw.activeIndex;
          }
          if (raw.activeTrack) {
            if (queue.length > activeIndex) {
              queue[activeIndex] = raw.activeTrack;
            }
            const changed =
              activeIndex !== prevIndex ||
              !prevTrack ||
              prevTrack.id !== raw.activeTrack.id ||
              prevTrack.url !== raw.activeTrack.url;
            if (changed) {
              emit(Event.PlaybackActiveTrackChanged, {
                track: raw.activeTrack,
                index: activeIndex,
              });
            }
          }
          if (raw.progress) {
            latestProgress = {
              position: raw.progress.position ?? 0,
              duration: raw.progress.duration ?? 0,
              buffered: raw.progress.buffered ?? 0,
            };
            emit(Event.PlaybackProgressUpdated, latestProgress);
          }
          break;
      }
    } catch {
      // ignore
    }
  };

  if (typeof window.addEventListener === "function") {
    window.addEventListener("message", onNativeMessage);
  }
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("message", onNativeMessage as any);
  }
}

function setPlaybackState(nextState: State) {
  currentState = nextState;
  emit(Event.PlaybackState, { state: nextState });
}

function emit(type: Event, data: any = {}) {
  listeners.forEach((listener) => {
    try {
      listener({ type, ...data });
    } catch {}
  });
}

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audioElement) {
    audioElement = new Audio();
    audioElement.addEventListener("play", () => {
      if (!shouldPlay) {
        audioElement?.pause();
        return;
      }
      setPlaybackState(State.Playing);
    });
    audioElement.addEventListener("playing", () => {
      if (!shouldPlay) {
        audioElement?.pause();
        return;
      }
      setPlaybackState(State.Playing);
    });
    audioElement.addEventListener("pause", () => {
      if (audioElement && audioElement.ended) return;
      if (!shouldPlay || currentState !== State.Loading) {
        shouldPlay = false;
        setPlaybackState(State.Paused);
      }
    });
    audioElement.addEventListener("ended", () => {
      if (repeatMode === RepeatMode.Track && audioElement) {
        audioElement.currentTime = 0;
        shouldPlay = true;
        audioElement.play().catch(() => {});
      } else if (activeIndex < queue.length - 1) {
        TrackPlayer.skipToNext();
      } else if (repeatMode === RepeatMode.Queue && queue.length > 0) {
        TrackPlayer.skip(0);
      } else {
        shouldPlay = false;
        setPlaybackState(State.Ended);
        emit(Event.PlaybackQueueEnded);
      }
    });
    audioElement.addEventListener("timeupdate", () => {
      if (audioElement) {
        emit(Event.PlaybackProgressUpdated, {
          position: audioElement.currentTime,
          duration: audioElement.duration || 0,
        });
      }
    });
  }
  return audioElement;
}

function destroyHls() {
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
}

function loadAudioSource(audio: HTMLAudioElement, url: string, autoPlay: boolean) {
  destroyHls();
  loadedUrl = url;
  shouldPlay = autoPlay;

  if (!url) {
    audio.pause();
    audio.removeAttribute("src");
    return;
  }

  const isHls = url.includes(".m3u8");

  if (isHls) {
    if (Hls.isSupported()) {
      const instance = new Hls({
        enableWorker: true,
      });
      hlsInstance = instance;
      instance.loadSource(url);
      instance.attachMedia(audio);
      instance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (hlsInstance === instance && shouldPlay) {
          audio.play().catch(() => {});
        }
      });
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (hlsInstance !== instance) return;
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (shouldPlay) instance.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              instance.recoverMediaError();
              break;
            default:
              destroyHls();
              audio.src = url;
              if (shouldPlay) {
                audio.play().catch(() => {});
              }
              break;
          }
        }
      });
      return;
    } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
      audio.src = url;
      if (shouldPlay) {
        audio.play().catch(() => {});
      }
      return;
    }
  }

  audio.src = url;
  if (shouldPlay) {
    audio.play().catch(() => {});
  }
}

const TrackPlayer = {
  setupPlayer: async (options?: any) => {
    if (isWebViewBridge()) {
      postToNative("setupPlayer", { options });
      currentState = State.Ready;
      return undefined;
    }
    if (currentState === State.None) {
      currentState = State.Ready;
    }
    return undefined;
  },
  updateOptions: async (options?: any) => {
    if (isWebViewBridge()) {
      postToNative("updateOptions", { options });
    }
    return undefined;
  },
  emit,
  registerPlaybackService: () => {},
  addEventListener: (event: Event, listener: (data: any) => void) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  },
  setQueue: async (newQueue: any[]) => {
    queue = [...newQueue];
    activeIndex = 0;
    if (isWebViewBridge()) {
      postToNative("setQueue", { queue: newQueue });
      return undefined;
    }
    loadedUrl = "";
    destroyHls();
    const audio = getAudio();
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
    if (queue.length > 0) {
      emit(Event.PlaybackActiveTrackChanged, { track: queue[0], index: 0 });
    }
    return undefined;
  },
  getQueue: async () => {
    if (queue.length === 0 && isWebViewBridge()) {
      try {
        const { askNative } = require("@/scripts/nativeShell");
        const nativeQueue = await (askNative as any)("getQueue");
        if (Array.isArray(nativeQueue) && nativeQueue.length > 0) {
          queue = [...nativeQueue];
        }
      } catch {}
    }
    return [...queue];
  },
  reset: async () => {
    queue = [];
    activeIndex = 0;
    if (isWebViewBridge()) {
      postToNative("reset");
      setPlaybackState(State.None);
      return undefined;
    }
    loadedUrl = "";
    shouldPlay = false;
    destroyHls();
    const audio = getAudio();
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
    setPlaybackState(State.None);
    return undefined;
  },
  getActiveTrack: async () => (queue.length > 0 ? queue[activeIndex] : undefined),
  getActiveTrackIndex: async () => (queue.length > 0 ? activeIndex : undefined),
  getPlaybackState: async (): Promise<PlaybackState> => ({ state: currentState }),
  add: async (tracks: any[] | any, insertBeforeIndex?: number) => {
    const items = Array.isArray(tracks) ? tracks : [tracks];
    if (
      typeof insertBeforeIndex === "number" &&
      insertBeforeIndex >= 0 &&
      insertBeforeIndex < queue.length
    ) {
      queue.splice(insertBeforeIndex, 0, ...items);
      if (insertBeforeIndex <= activeIndex) activeIndex += items.length;
    } else {
      queue.push(...items);
    }
    if (isWebViewBridge()) {
      postToNative("add", { tracks: items, insertBeforeIndex });
    }
    return undefined;
  },
  remove: async (indexes: number | number[]) => {
    const list = (Array.isArray(indexes) ? indexes : [indexes]).sort((a, b) => b - a);
    for (const index of list) {
      if (index < 0 || index >= queue.length || index === activeIndex) continue;
      queue.splice(index, 1);
      if (index < activeIndex) activeIndex -= 1;
    }
    if (isWebViewBridge()) {
      postToNative("remove", { indexes });
    }
    return undefined;
  },
  move: async (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || fromIndex >= queue.length) return undefined;
    const activeTrack = queue[activeIndex];
    const [item] = queue.splice(fromIndex, 1);
    queue.splice(Math.min(Math.max(toIndex, 0), queue.length), 0, item);
    activeIndex = queue.indexOf(activeTrack);
    if (isWebViewBridge()) {
      postToNative("move", { fromIndex, toIndex });
    }
    return undefined;
  },
  removeUpcomingTracks: async () => {
    queue = queue.slice(0, activeIndex + 1);
    if (isWebViewBridge()) {
      postToNative("removeUpcomingTracks");
    }
    return undefined;
  },
  skip: async (index: number) => {
    if (index >= 0 && index < queue.length) {
      activeIndex = index;
      const track = queue[activeIndex];
      emit(Event.PlaybackActiveTrackChanged, { track, index });
      if (isWebViewBridge()) {
        postToNative("skip", { index });
        return undefined;
      }
      const audio = getAudio();
      if (audio && track?.url) {
        loadAudioSource(audio, track.url, shouldPlay);
      }
    }
    return undefined;
  },
  skipToNext: async () => {
    if (isWebViewBridge()) {
      postToNative("skipToNext");
      if (activeIndex < queue.length - 1) {
        activeIndex += 1;
        emit(Event.PlaybackActiveTrackChanged, { track: queue[activeIndex], index: activeIndex });
      }
      return undefined;
    }
    if (activeIndex < queue.length - 1) {
      shouldPlay = true;
      await TrackPlayer.skip(activeIndex + 1);
      setPlaybackState(State.Playing);
    }
    return undefined;
  },
  skipToPrevious: async () => {
    if (isWebViewBridge()) {
      postToNative("skipToPrevious");
      if (activeIndex > 0) {
        activeIndex -= 1;
        emit(Event.PlaybackActiveTrackChanged, { track: queue[activeIndex], index: activeIndex });
      }
      return undefined;
    }
    if (activeIndex > 0) {
      shouldPlay = true;
      await TrackPlayer.skip(activeIndex - 1);
      setPlaybackState(State.Playing);
    }
    return undefined;
  },
  play: async () => {
    if (isWebViewBridge()) {
      setPlaybackState(State.Playing);
      postToNative("play");
      return;
    }
    shouldPlay = true;
    setPlaybackState(State.Playing);
    const audio = getAudio();
    if (audio) {
      const targetUrl = queue[activeIndex]?.url || "";
      if (targetUrl && loadedUrl !== targetUrl) {
        loadAudioSource(audio, targetUrl, true);
      } else if (hlsInstance) {
        hlsInstance.startLoad();
        await audio.play().catch(() => {});
      } else if (audio.src) {
        await audio.play().catch(() => {});
      }
    }
  },
  pause: async () => {
    if (isWebViewBridge()) {
      setPlaybackState(State.Paused);
      postToNative("pause");
      return;
    }
    shouldPlay = false;
    setPlaybackState(State.Paused);
    const audio = getAudio();
    if (audio) {
      audio.pause();
    }
  },
  stop: async () => {
    if (isWebViewBridge()) {
      setPlaybackState(State.Stopped);
      postToNative("stop");
      return;
    }
    shouldPlay = false;
    if (hlsInstance) {
      hlsInstance.stopLoad();
    }
    const audio = getAudio();
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaybackState(State.Stopped);
  },
  seekTo: async (position: number) => {
    if (isWebViewBridge()) {
      latestProgress.position = position;
      emit(Event.PlaybackProgressUpdated, latestProgress);
      postToNative("seekTo", { position });
      return;
    }
    const audio = getAudio();
    if (audio) audio.currentTime = position;
  },
  getProgress: async () => {
    if (isWebViewBridge()) {
      return { ...latestProgress };
    }
    const audio = getAudio();
    return {
      position: audio?.currentTime || 0,
      duration: audio?.duration || 0,
      buffered: 0,
    };
  },
  setRepeatMode: async (mode: RepeatMode) => {
    repeatMode = mode;
    if (isWebViewBridge()) {
      postToNative("setRepeatMode", { mode });
    }
  },
  getRepeatMode: async () => repeatMode,
};

export default TrackPlayer;

import { useState, useEffect, useRef } from "react";

export function usePlaybackState(): PlaybackState {
  const [state, setState] = useState<State>(currentState);

  useEffect(() => {
    setState(currentState);
    const listener = (e: any) => {
      if (e.type === Event.PlaybackState && e.state !== undefined) {
        setState(e.state);
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { state };
}

export function useProgress(updateInterval: number = 250) {
  const [progress, setProgress] = useState(latestProgress);

  useEffect(() => {
    if (isWebViewBridge()) {
      setProgress(latestProgress);
      const listener = (e: any) => {
        if (e.type === Event.PlaybackProgressUpdated) {
          setProgress({
            position: e.position || 0,
            duration: e.duration || 0,
            buffered: e.buffered || 0,
          });
        }
      };
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }

    const audio = getAudio();
    if (!audio) return;

    const update = () => {
      setProgress({
        position: audio.currentTime || 0,
        duration: audio.duration || 0,
        buffered: 0,
      });
    };

    update();
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("loadedmetadata", update);
    audio.addEventListener("durationchange", update);
    audio.addEventListener("seeking", update);
    audio.addEventListener("seeked", update);

    const intervalId = setInterval(update, updateInterval);

    return () => {
      audio.removeEventListener("timeupdate", update);
      audio.removeEventListener("loadedmetadata", update);
      audio.removeEventListener("durationchange", update);
      audio.removeEventListener("seeking", update);
      audio.removeEventListener("seeked", update);
      clearInterval(intervalId);
    };
  }, [updateInterval]);

  return progress;
}

export function useTrackPlayerEvents(events: Event[], handler: (event: any) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const eventsKey = events.join("|");

  useEffect(() => {
    const listener = (e: any) => {
      if (events.includes(e.type)) handlerRef.current(e);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsKey]);
}
