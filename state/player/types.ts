// The repeat button cycles off → repeat all → repeat one
export type RepeatSetting = "none" | "queue" | "track";
export const REPEAT_CYCLE: RepeatSetting[] = ["none", "queue", "track"];

export type QueueSection = "queue" | "upcoming";
export type QueueSlot = { section: QueueSection; index: number };

export interface PlayerContextType {
  // The name of what Next Up came from
  queueSource: string;
  // Your Queue, then Next Up followed by Discovery (Discovery songs carry `autoplay`)
  userQueue: RNTrack[];
  upcoming: RNTrack[];
  addToQueue: (track: RNTrack) => Promise<void>;
  removeFromUserQueue: (index: number) => Promise<void>;
  clearUserQueue: () => Promise<void>;
  moveQueueItem: (from: QueueSlot, to: QueueSlot) => Promise<void>;
  playFromUserQueue: (index: number) => Promise<void>;
  skipToUpcoming: (index: number) => Promise<void>;
  activeTrack: RNTrack | undefined;
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
