import TrackPlayer, { Event, RepeatMode } from "react-native-track-player";

import { isRadioSetComplete, resetRadioTimer } from "@/scripts/radioTimer";

// Next track, wrapping to the start at the end of the queue
async function skipToNextTrack() {
  const queue = await TrackPlayer.getQueue();
  const trackIndex = await TrackPlayer.getActiveTrackIndex();
  if (queue.length === 0 || trackIndex === undefined) return;

  if (trackIndex >= queue.length - 1) {
    await TrackPlayer.skip(0);
  } else {
    await TrackPlayer.skipToNext();
  }
}

module.exports = async function () {
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async () => {
    resetRadioTimer();
  });
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    try {
      await TrackPlayer.play();
    } catch (err) {
      console.error("RemotePlay error:", err);
    }
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    try {
      await TrackPlayer.pause();
    } catch (err) {
      console.error("RemotePause error:", err);
    }
  });

  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    try {
      await skipToNextTrack();
    } catch (err) {
      console.error("RemoteNext error:", err);
    }
  });

  // A station's set ends after 10 minutes of listening (repeat one keeps it on)
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, async ({ position }) => {
    try {
      if (!isRadioSetComplete(position)) return;
      const active = (await TrackPlayer.getActiveTrack()) as RNTrack | undefined;
      if (!active?.liveStation) return;
      if ((await TrackPlayer.getRepeatMode()) === RepeatMode.Track) return;
      resetRadioTimer();
      await skipToNextTrack();
    } catch (err) {
      console.error("Radio set error:", err);
    }
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    try {
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
      console.error("RemotePrevious error:", err);
    }
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async ({ position }) => {
    try {
      await TrackPlayer.seekTo(position);
    } catch (err) {
      console.error("RemoteSeek error:", err);
    }
  });

  TrackPlayer.addEventListener(Event.RemoteDuck, async ({ paused, permanent }) => {
    try {
      if (permanent || paused) {
        await TrackPlayer.pause();
      } else {
        await TrackPlayer.play();
      }
    } catch (err) {
      console.error("RemoteDuck error:", err);
    }
  });
};
