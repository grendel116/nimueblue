// Runs the real player host and provider against the web player stand-in, checking that the
// queue screen's sections and the audio player agree after each listener action
class FakeAudio {
  src = "";
  paused = true;
  currentTime = 0;
  duration = 0;
  addEventListener() {}
  removeEventListener() {}
  removeAttribute() {}
  load() {}
  pause() {
    this.paused = true;
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  canPlayType() {
    return "";
  }
}
(globalThis as any).Audio = FakeAudio;

jest.mock("react-native-track-player", () => require("../shims/react-native-track-player.web"));
let mockDiscoveryServed = 0;
let mockDiscoveryOn = false;
jest.mock("@/scripts/autoplay", () => {
  const nextTrack = () => {
    mockDiscoveryServed += 1;
    return {
      id: `d${mockDiscoveryServed}`,
      title: `Find ${mockDiscoveryServed}`,
      url: `https://example.com/d${mockDiscoveryServed}.mp3`,
    };
  };
  return {
    AUTOPLAY_SOURCE: "Discovery",
    DISCOVERY_BUFFER_SIZE: 12,
    drawFromReservoir: jest.fn((count: number) =>
      mockDiscoveryOn ? Array.from({ length: count }, nextTrack) : [],
    ),
    replenishDiscoveryReservoir: jest.fn(async () =>
      mockDiscoveryOn ? Array.from({ length: 12 }, nextTrack) : [],
    ),
    fetchDiscoveryTracks: jest.fn(async (take: number) =>
      mockDiscoveryOn ? Array.from({ length: take }, nextTrack) : [],
    ),
  };
});

import React from "react";
import { act, create } from "react-test-renderer";
import TrackPlayer from "react-native-track-player";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PlayerContextProvider, usePlayer, type PlayerContextType } from "@/state/PlayerContext";
import { kvStorage } from "@/scripts/storage/kvStorage";
import { createPlayerHost, QUEUE_KEY, type PlayerHost } from "@/state/player/host";

const song = (id: number, title = `Song ${id}`): RNTrack =>
  ({ id: `s${id}` as any, title, url: `https://example.com/${id}.mp3` }) as RNTrack;

let player: PlayerContextType;
function Probe() {
  player = usePlayer(
    "activeTrack",
    "userQueue",
    "upcoming",
    "queueSource",
    "addToQueue",
    "playTrack",
    "skipNext",
    "skipPrevious",
    "playFromUserQueue",
    "skipToUpcoming",
  ) as PlayerContextType;
  return null;
}

// Lets queued player calls and state updates finish
async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

const titles = (list: RNTrack[]) => list.map((t) => t.title);
async function playerOrder() {
  const queue = (await TrackPlayer.getQueue()) as RNTrack[];
  const index = (await TrackPlayer.getActiveTrackIndex()) ?? -1;
  return { titles: titles(queue), index };
}

const album = [
  song(1, "Sator Arepo"),
  song(2, "What Cheer Iowa"),
  song(3, "People on TV"),
  song(4, "Late Night Radio"),
];
const radio = song(9, "50s 60s RETRO HITS");

describe("player queue", () => {
  let renderer: ReturnType<typeof create> | undefined;
  let host: PlayerHost;

  const showScreens = async () => {
    act(() => {
      renderer = create(
        <PlayerContextProvider connection={host}>
          <Probe />
        </PlayerContextProvider>,
      );
    });
    await settle();
  };

  beforeEach(async () => {
    kvStorage.clearAll();
    await AsyncStorage.clear();
    await TrackPlayer.reset();
    host = createPlayerHost();
    await showScreens();
  });

  afterEach(async () => {
    act(() => renderer?.unmount());
    host.dispose();
    await settle();
  });

  test("adding with nothing playing fills Your Queue and leaves the player empty", async () => {
    await act(() => player.addToQueue(radio));
    await settle();
    expect(player.activeTrack).toBeUndefined();
    expect(titles(player.userQueue)).toEqual([radio.title]);
    expect((await playerOrder()).titles).toEqual([]);
  });

  test("the radio stays in Your Queue when an album starts, and plays right after the current song", async () => {
    await act(() => player.addToQueue(radio));
    await act(() => player.playTrack(album[0], album, "Space Trash (EP)"));
    await settle();

    expect(player.activeTrack?.title).toBe("Sator Arepo");
    expect(titles(player.userQueue)).toEqual([radio.title]);
    expect(titles(player.upcoming)).toEqual([
      "What Cheer Iowa",
      "People on TV",
      "Late Night Radio",
    ]);
    expect(player.queueSource).toBe("Space Trash (EP)");
    expect(await playerOrder()).toEqual({
      titles: ["Sator Arepo", radio.title, "What Cheer Iowa", "People on TV", "Late Night Radio"],
      index: 0,
    });

    await act(() => player.skipNext());
    await settle();
    expect(player.activeTrack?.title).toBe(radio.title);
    expect(player.userQueue).toEqual([]);
    expect(await playerOrder()).toEqual({
      titles: ["Sator Arepo", radio.title, "What Cheer Iowa", "People on TV", "Late Night Radio"],
      index: 1,
    });
  });

  test("starting an album and skipping to the second song keeps the rest of the album in Next Up before Discovery", async () => {
    mockDiscoveryOn = true;
    try {
      await act(() => player.playTrack(album[0], album, "Space Trash (EP)"));
      await settle();

      const setQueue = jest.spyOn(TrackPlayer, "setQueue");
      const remove = jest.spyOn(TrackPlayer, "remove");
      const removeUpcoming = jest.spyOn(TrackPlayer, "removeUpcomingTracks");
      try {
        await act(() => player.skipNext());
        await settle();

        expect(player.activeTrack?.title).toBe("What Cheer Iowa");
        expect(player.queueSource).toBe("Space Trash (EP)");
        const nextUp = player.upcoming.filter((t) => !t.autoplay);
        const discovery = player.upcoming.filter((t) => t.autoplay);
        expect(titles(nextUp)).toEqual(["People on TV", "Late Night Radio"]);
        expect(discovery).toHaveLength(12);
        // Skipping within an album is a single skip() call with zero queue rebuilds
        expect(setQueue).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
        expect(removeUpcoming).not.toHaveBeenCalled();
      } finally {
        setQueue.mockRestore();
        remove.mockRestore();
        removeUpcoming.mockRestore();
      }
    } finally {
      mockDiscoveryOn = false;
    }
  });

  test("saved queues with legacy colliding _queueKey values are given unique keys on restore", async () => {
    act(() => renderer?.unmount());
    host.dispose();
    kvStorage.set(
      QUEUE_KEY,
      JSON.stringify({
        history: [],
        current: { track: { id: 1, title: "Old Song", url: "https://example.com/1.mp3", _queueKey: "qk-1" }, from: "nextUp" },
        userQueue: [],
        nextUp: [{ id: 2, title: "Album Track 2", url: "https://example.com/2.mp3", _queueKey: "qk-2" }],
        discovery: [{ id: 99, title: "Discovery Track", url: "https://example.com/99.mp3", _queueKey: "qk-2", autoplay: true }],
        source: "Saved Album",
      }),
    );
    host = createPlayerHost();
    await showScreens();

    expect(player.upcoming).toHaveLength(2);
    expect(player.upcoming[0]._queueKey).not.toBe(player.upcoming[1]._queueKey);
    expect(titles(player.upcoming)).toEqual(["Album Track 2", "Discovery Track"]);
  });

  test("adding during playback goes under Your Queue, not into Next Up", async () => {
    await act(() => player.playTrack(album[0], album, "Space Trash (EP)"));
    await settle();
    await act(() => player.addToQueue(radio));
    await settle();
    expect(titles(player.userQueue)).toEqual([radio.title]);
    expect(titles(player.upcoming)).toEqual([
      "What Cheer Iowa",
      "People on TV",
      "Late Night Radio",
    ]);
    expect((await playerOrder()).titles).toEqual([
      "Sator Arepo",
      radio.title,
      "What Cheer Iowa",
      "People on TV",
      "Late Night Radio",
    ]);
  });

  test("the player moving on by itself is followed by the sections", async () => {
    await act(() => player.addToQueue(radio));
    await act(() => player.playTrack(album[0], album, "Space Trash (EP)"));
    await settle();
    await act(() => TrackPlayer.skipToNext());
    await settle();
    expect(player.activeTrack?.title).toBe(radio.title);
    expect(player.userQueue).toEqual([]);
    expect(titles(player.upcoming)).toEqual([
      "What Cheer Iowa",
      "People on TV",
      "Late Night Radio",
    ]);
    expect(await playerOrder()).toEqual({
      titles: ["Sator Arepo", radio.title, "What Cheer Iowa", "People on TV", "Late Night Radio"],
      index: 1,
    });
  });

  test("tapping a Next Up song keeps Your Queue next", async () => {
    await act(() => player.addToQueue(radio));
    await act(() => player.playTrack(album[0], album, "Space Trash (EP)"));
    await settle();
    await act(() => player.skipToUpcoming(1));
    await settle();
    expect(player.activeTrack?.title).toBe("People on TV");
    expect(titles(player.userQueue)).toEqual([radio.title]);
    const order = await playerOrder();
    expect(order.titles[order.index]).toBe("People on TV");
    expect(order.titles[order.index + 1]).toBe(radio.title);
  });

  test("Previous puts a Your Queue song back on top of Your Queue", async () => {
    await act(() => player.addToQueue(radio));
    await act(() => player.playTrack(album[0], album, "Space Trash (EP)"));
    await settle();
    await act(() => player.skipNext());
    await settle();
    await act(() => player.skipPrevious());
    await settle();
    expect(player.activeTrack?.title).toBe("Sator Arepo");
    expect(titles(player.userQueue)).toEqual([radio.title]);
    expect((await playerOrder()).index).toBe(0);
  });

  test("Discovery maintains 12 songs, appending synchronously on skip without rebuilding the player queue", async () => {
    mockDiscoveryOn = true;
    try {
      await act(() => player.playTrack(album[3], album, "Space Trash (EP)"));
      await settle();
      const discovery = () => player.upcoming.filter((t) => t.autoplay);
      expect(discovery()).toHaveLength(12);

      const removeUpcoming = jest.spyOn(TrackPlayer, "removeUpcomingTracks");
      try {
        // Skipping advances playback into discovery, taking 1 song and appending 1 at the tail
        await act(() => player.skipNext());
        await settle();
        expect(player.activeTrack?.autoplay).toBe(true);
        expect(discovery()).toHaveLength(12);
        expect(removeUpcoming).not.toHaveBeenCalled();
      } finally {
        removeUpcoming.mockRestore();
      }

      // Tapping a discovery song directly takes it from the discovery queue
      await act(() => player.skipToUpcoming(1));
      await settle();
      expect(discovery()).toHaveLength(12);
    } finally {
      mockDiscoveryOn = false;
    }
  });

  test("songs that play on while the screens are away show up when they come back", async () => {
    await act(() => player.playTrack(album[0], album, "Space Trash (EP)"));
    await settle();

    // The screens go away (the phone is locked) while the audio player moves on twice
    act(() => renderer?.unmount());
    await act(() => TrackPlayer.skipToNext());
    await settle();
    await act(() => TrackPlayer.skipToNext());
    await settle();

    const setQueue = jest.spyOn(TrackPlayer, "setQueue");
    const reset = jest.spyOn(TrackPlayer, "reset");
    try {
      await showScreens();
      const order = await playerOrder();
      expect(player.activeTrack?.title).toBe("People on TV");
      expect(order.titles[order.index]).toBe("People on TV");
      expect(titles(player.upcoming)).toEqual(["Late Night Radio"]);
      // Coming back never reloads the song playing
      expect(setQueue).not.toHaveBeenCalled();
      expect(reset).not.toHaveBeenCalled();
    } finally {
      setQueue.mockRestore();
      reset.mockRestore();
    }
  });

  test("editing the queue during playback only updates the upcoming tracks", async () => {
    await act(() => player.playTrack(album[0], album, "Space Trash (EP)"));
    await settle();
    const setQueue = jest.spyOn(TrackPlayer, "setQueue");
    const skip = jest.spyOn(TrackPlayer, "skip");
    try {
      await act(() => player.addToQueue(radio));
      await settle();
      expect(await playerOrder()).toEqual({
        titles: ["Sator Arepo", radio.title, "What Cheer Iowa", "People on TV", "Late Night Radio"],
        index: 0,
      });
      expect(setQueue).not.toHaveBeenCalled();
      expect(skip).not.toHaveBeenCalled();
    } finally {
      setQueue.mockRestore();
      skip.mockRestore();
    }
  });
});
