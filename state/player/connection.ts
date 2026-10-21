// How screens reach the player host. In a browser the host runs right here in the page. Inside
// the Android app it runs on the phone side: requests go over the bridge, and every change comes
// back as the full state, so the screens always show what the phone side holds
import { IN_NATIVE_SHELL, onNative, tellNative } from "@/scripts/nativeShell";
import { adoptPlayCounts, PLAY_COUNTS_KEY } from "@/scripts/trackPlayUtils";
import {
  getPlayerHost,
  QUEUE_KEY,
  type HostMessage,
  type PlayerConnection,
  type PlayerRequest,
  type PlayerSnapshot,
} from "./host";

// The queue and play counts this web app saved before 1.1.7 move to the phone side, once
function handOffSaved(request: (r: PlayerRequest) => Promise<void>) {
  const storage = window.localStorage;
  const savedQueue = storage.getItem(QUEUE_KEY) ?? undefined;
  const rawCounts = storage.getItem(PLAY_COUNTS_KEY);
  if (!savedQueue && !rawCounts) return;
  let playCounts: Record<number, number> | undefined;
  try {
    playCounts = rawCounts ? JSON.parse(rawCounts) : undefined;
  } catch {
    playCounts = undefined;
  }
  request({ type: "handoff", savedQueue, playCounts });
  storage.removeItem(QUEUE_KEY);
  storage.removeItem(PLAY_COUNTS_KEY);
}

function bridgeConnection(): PlayerConnection {
  let latest: PlayerSnapshot = {
    activeTrack: undefined,
    userQueue: [],
    upcoming: [],
    queueSource: "",
    shuffled: false,
    looping: "none",
    playCounts: {},
  };
  const listeners = new Set<(message: HostMessage) => void>();

  onNative("player", ({ message }: { message: HostMessage }) => {
    if (message.type === "state") {
      latest = message.snapshot;
      adoptPlayCounts(latest.playCounts);
    }
    listeners.forEach((listener) => listener(message));
  });

  const request = (r: PlayerRequest) => {
    tellNative("player", { request: r });
    return Promise.resolve();
  };

  handOffSaved(request);
  request({ type: "refresh" });

  return {
    request,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => latest,
  };
}

let connection: PlayerConnection | undefined;

export function playerConnection(): PlayerConnection {
  if (!connection) connection = IN_NATIVE_SHELL ? bridgeConnection() : getPlayerHost();
  return connection;
}
