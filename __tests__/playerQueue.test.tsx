// Runs the real player provider against the web player stand-in, checking that the queue
// screen's sections and the player's play order agree after each listener action
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
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PlayerContextProvider, usePlayer, type PlayerContextType } from "@/state/PlayerContext";
import { kvStorage } from "@/scripts/storage/kvStorage";
import { useQueueStore } from "@/state/player/useQueueStore";

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

const album = [song(1, "Sator Arepo"), song(2, "What Cheer Iowa"), song(3, "People on TV")];
const radio = song(9, "50s 60s RETRO HITS");

describe("player queue", () => {
  let renderer: ReturnType<typeof create> | undefined;

  beforeEach(async () => {
    kvStorage.clearAll();
    useQueueStore.getState().resetQueue();
    await AsyncStorage.clear();
    await TrackPlayer.reset();
    act(() => {
      renderer = create(
        <PlayerContextProvider>
          <Probe />
        </PlayerContextProvider>,
      );
    });
    await settle();
  });

  afterEach(async () => {
    act(() => renderer?.unmount());
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
    expect(titles(player.upcoming)).toEqual(["What Cheer Iowa", "People on TV"]);
    expect(player.queueSource).toBe("Space Trash (EP)");
    expect(await playerOrder()).toEqual({
      titles: ["Sator Arepo", radio.title, "What Cheer Iowa", "People on TV"],
      index: 0,
    });

    await act(() => player.skipNext());
    await settle();
    expect(player.activeTrack?.title).toBe(radio.title);
    expect(player.userQueue).toEqual([]);
    expect((await playerOrder()).index).toBe(1);
  });

  test("adding during playback goes under Your Queue, not into Next Up", async () => {
    await act(() => player.playTrack(album[0], album, "Space Trash (EP)"));
    await settle();
    await act(() => player.addToQueue(radio));
    await settle();
    expect(titles(player.userQueue)).toEqual([radio.title]);
    expect(titles(player.upcoming)).toEqual(["What Cheer Iowa", "People on TV"]);
    expect((await playerOrder()).titles).toEqual([
      "Sator Arepo",
      radio.title,
      "What Cheer Iowa",
      "People on TV",
    ]);
  });

  test("the player moving on by itself is followed by the sections", async () => {
    await act(() => player.addToQueue(radio));
    await act(() => player.playTrack(album[0], album, "Space Trash (EP)"));
    await settle();
    await act(() => TrackPlayer.skip(2));
    await settle();
    expect(player.activeTrack?.title).toBe("What Cheer Iowa");
    expect(player.userQueue).toEqual([]);
    expect(titles(player.upcoming)).toEqual(["People on TV"]);
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

  test("Discovery maintains exactly 12 songs, adding one whenever a song is taken from discovery", async () => {
    mockDiscoveryOn = true;
    try {
      await act(() => player.playTrack(album[2], album, "Space Trash (EP)"));
      await settle();
      const discovery = () => player.upcoming.filter((t) => t.autoplay);
      expect(discovery()).toHaveLength(12);

      // Skipping advances playback into discovery, taking 1 song from the discovery queue
      await act(() => player.skipNext());
      await settle();
      expect(player.activeTrack?.autoplay).toBe(true);
      expect(discovery()).toHaveLength(12);

      // Tapping a discovery song directly takes it from the discovery queue
      await act(() => player.skipToUpcoming(1));
      await settle();
      expect(discovery()).toHaveLength(12);
    } finally {
      mockDiscoveryOn = false;
    }
  });

  test("unlocking/resuming the app with active playback does not skip songs forward", async () => {
    // Start album playback at track 1 ("What Cheer Iowa")
    await act(() => player.playTrack(album[1], album, "Space Trash (EP)"));
    await settle();

    expect(player.activeTrack?.title).toBe("What Cheer Iowa");
    expect(titles(player.upcoming)).toEqual(["People on TV"]);

    // Simulate active track changed event on resume with the currently playing track
    await act(async () => {
      (TrackPlayer as any).emit("playback-active-track-changed", {
        track: album[1],
        index: 0,
      });
    });
    await settle();

    // The current track should STILL be "What Cheer Iowa" and not have skipped forward!
    expect(player.activeTrack?.title).toBe("What Cheer Iowa");
    expect(titles(player.upcoming)).toEqual(["People on TV"]);
  });

  test("app resume or network reconnect while playing does not restart playback from 0:00", async () => {
    await act(() => player.playTrack(album[0], album, "Space Trash (EP)"));
    await settle();

    const spySetQueue = jest.spyOn(TrackPlayer, "setQueue");
    const spySkip = jest.spyOn(TrackPlayer, "skip");
    const spyReset = jest.spyOn(TrackPlayer, "reset");
    const spySeekTo = jest.spyOn(TrackPlayer, "seekTo");

    try {
      // Simulate app becoming active on phone unlock
      await act(async () => {
        (AppState as any).emit?.("change", "active");
      });
      await settle();

      // Ensure no disruptive player actions were taken that would reset or restart audio
      expect(spySetQueue).not.toHaveBeenCalled();
      expect(spySkip).not.toHaveBeenCalled();
      expect(spyReset).not.toHaveBeenCalled();
      expect(spySeekTo).not.toHaveBeenCalled();
      expect(player.activeTrack?.title).toBe(album[0].title);
    } finally {
      spySetQueue.mockRestore();
      spySkip.mockRestore();
      spyReset.mockRestore();
      spySeekTo.mockRestore();
    }
  });
});
