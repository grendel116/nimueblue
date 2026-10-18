import { RepeatMode } from "react-native-track-player";

// The repeat button cycles off → repeat all → repeat one
export type RepeatSetting = "none" | "queue" | "track";
export const REPEAT_CYCLE: RepeatSetting[] = ["none", "queue", "track"];
export const REPEAT_MODES: Record<RepeatSetting, RepeatMode> = {
  none: RepeatMode.Off,
  queue: RepeatMode.Queue,
  track: RepeatMode.Track,
};

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
