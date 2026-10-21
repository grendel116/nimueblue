import TrackPlayer, { Event, RepeatMode } from "react-native-track-player";

import { isRadioSetComplete, resetRadioTimer } from "@/scripts/radioTimer";
import { getPlayerHost } from "@/state/player/host";

// Lock screen, notification and headphone buttons go to the player host like any other tap
module.exports = async function () {
  const host = getPlayerHost();

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async () => {
    resetRadioTimer();
  });

  TrackPlayer.addEventListener(Event.RemotePlay, () => host.request({ type: "play" }));
  TrackPlayer.addEventListener(Event.RemotePause, () => host.request({ type: "pause" }));
  TrackPlayer.addEventListener(Event.RemoteNext, () => host.request({ type: "skipNext" }));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => host.request({ type: "skipPrevious" }));
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) =>
    host.request({ type: "seekTo", position }),
  );

  // A station's set ends after 10 minutes of listening (repeat one keeps it on)
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, async ({ position }) => {
    try {
      if (!isRadioSetComplete(position)) return;
      if (!host.snapshot().activeTrack?.liveStation) return;
      if ((await TrackPlayer.getRepeatMode()) === RepeatMode.Track) return;
      resetRadioTimer();
      await host.request({ type: "skipNext" });
    } catch (err) {
      console.error("Radio set error:", err);
    }
  });

  // Another app taking the audio pauses playback; getting it back resumes
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
