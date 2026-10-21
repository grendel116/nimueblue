import {
  createContext,
  useState,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import { usePlaybackState, State } from "react-native-track-player";
import { disabledIds, isTrackDisabledSync } from "@/scripts/trackPlayUtils";
import { useIsOnline } from "@/scripts/useIsOnline";
import { blockFaircampDomain } from "@/queries/fairplayer";
import { createStore, type Store } from "./store";
import {
  type RepeatSetting,
  type QueueSection,
  type QueueSlot,
  type PlayerContextType,
} from "./player/types";
import { playerConnection } from "./player/connection";
import type { PlayerConnection, PlayerRequest } from "./player/host";

export type { RepeatSetting, QueueSection, QueueSlot, PlayerContextType };

type PlayerStore = Store<PlayerContextType>;

// Carries a store that never changes identity; components subscribe through usePlayer
export const PlayerContext = createContext<PlayerStore | null>(null);

// Album pages hand over tracks whose album lists every track again; only the album's details travel
function portable(track: RNTrack): RNTrack {
  if (!track.trackGroup || typeof track.trackGroup !== "object") return track;
  const { tracks: _tracks, ...album } = track.trackGroup as AlbumProps;
  return { ...track, trackGroup: album as AlbumProps };
}

// The screens' side of the player: shows the state the player host sends and passes taps to it.
// The host owns the queue and the audio player (see player/host.ts)
export const PlayerContextProvider: React.FC<{
  children: React.ReactNode;
  connection?: PlayerConnection;
}> = ({ children, connection: given }) => {
  const [connection] = useState(() => given ?? playerConnection());
  const [snapshot, setSnapshot] = useState(() => connection.snapshot());
  const playBackState = usePlaybackState();
  const isOnline = useIsOnline();

  useLayoutEffect(() => {
    setSnapshot(connection.snapshot());
    return connection.subscribe((message) => {
      if (message.type === "state") setSnapshot(message.snapshot);
      else blockFaircampDomain(message.url);
    });
  }, [connection]);

  useEffect(() => {
    connection.request({ type: "setOnline", online: isOnline });
  }, [connection, isOnline]);

  const actions = useMemo(() => {
    const send = (request: PlayerRequest) => connection.request(request);
    return {
      playTrack: (track: RNTrack, albumTracks?: RNTrack[], source?: string) =>
        send({ type: "playTrack", track: portable(track), albumTracks: albumTracks?.map(portable), source }),
      togglePlayPause: () => send({ type: "togglePlayPause" }),
      skipNext: () => send({ type: "skipNext" }),
      skipPrevious: () => send({ type: "skipPrevious" }),
      seekTo: (position: number) => send({ type: "seekTo", position }),
      addToQueue: (track: RNTrack) => send({ type: "addToQueue", track: portable(track) }),
      removeFromUserQueue: (index: number) => send({ type: "removeFromUserQueue", index }),
      clearUserQueue: () => send({ type: "clearUserQueue" }),
      moveQueueItem: (from: QueueSlot, to: QueueSlot) => send({ type: "moveQueueItem", from, to }),
      playFromUserQueue: (index: number) => send({ type: "playFromUserQueue", index }),
      skipToUpcoming: (index: number) => send({ type: "skipToUpcoming", index }),
      toggleShuffle: () => send({ type: "toggleShuffle" }),
      cycleRepeat: () => send({ type: "cycleRepeat" }),
    };
  }, [connection]);

  const { activeTrack, userQueue, upcoming, queueSource, shuffled, looping, playCounts } = snapshot;
  const disabledTrackIds = useMemo(() => disabledIds(playCounts), [playCounts]);
  const isTrackDisabled = useMemo(
    () => (trackId?: number) =>
      typeof trackId === "number" && (disabledTrackIds.has(trackId) || isTrackDisabledSync(trackId)),
    [disabledTrackIds],
  );

  const isPlaying =
    playBackState.state === State.Playing ||
    playBackState.state === State.Buffering ||
    playBackState.state === State.Loading;

  const value: PlayerContextType = useMemo(
    () => ({
      ...actions,
      queueSource,
      userQueue,
      upcoming,
      activeTrack,
      shuffled,
      isPlaying,
      looping,
      disabledTrackIds,
      isTrackDisabled,
    }),
    [
      actions,
      queueSource,
      userQueue,
      upcoming,
      activeTrack,
      shuffled,
      isPlaying,
      looping,
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
