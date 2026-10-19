import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  IOSCategory,
  IOSCategoryOptions,
} from "react-native-track-player";

export const setupPlayerOptions = {
  autoHandleInterruptions: true,
  // ExoPlayer keeps up to 512 MB of streamed audio on disk (Android, in kilobytes)
  maxCacheSize: 512 * 1024,
  iosCategory: IOSCategory.Playback,
  iosCategoryOptions: [
    IOSCategoryOptions.AllowAirPlay,
    IOSCategoryOptions.AllowBluetoothA2DP,
  ],
};

export const updatePlayerOptions = {
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
