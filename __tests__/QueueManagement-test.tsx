jest.mock("react-native-track-player", () => ({
  __esModule: true,
  default: {
    getQueue: jest.fn().mockResolvedValue([]),
    getActiveTrackIndex: jest.fn().mockResolvedValue(0),
    add: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  },
  TrackType: { HLS: "hls", Default: "default" },
}));

import { isTrackOwnedOrPreview } from "@/scripts/utils";
import { createMockRNTrack } from "@/__mocks__/mockRNTrack";
import { toNativeTrack } from "@/state/player/trackUtils";

describe("Queue Management", () => {
  test("Includes preview tracks in queue and excludes non-preview tracks", async () => {
    const previewTrack1 = createMockRNTrack({ isPreview: true, id: 1 });
    const nonPreviewTrack = createMockRNTrack({
      isPreview: false,
      id: 2,
    });
    const previewTrack2 = createMockRNTrack({ isPreview: true, id: 3 });
    const previewTrack3 = createMockRNTrack({ isPreview: true, id: 4 });

    const tracks = [
      previewTrack1,
      nonPreviewTrack,
      previewTrack2,
      previewTrack3,
    ];

    const queue = tracks.filter((track) => isTrackOwnedOrPreview(track));

    expect(queue).toHaveLength(3);
    expect(queue).toContain(previewTrack1);
    expect(queue).toContain(previewTrack2);
    expect(queue).toContain(previewTrack3);
    expect(queue).not.toContain(nonPreviewTrack);
  });

  test("Allows adding, removing, and clearing userQueue", () => {
    let userQueue: RNTrack[] = [];
    const addToQueue = (track: RNTrack) => {
      userQueue = [...userQueue, track];
    };
    const removeFromUserQueue = (index: number) => {
      userQueue = userQueue.filter((_, i) => i !== index);
    };
    const clearUserQueue = () => {
      userQueue = [];
    };

    const trackA = createMockRNTrack({ id: 101, title: "Song A" });
    const trackB = createMockRNTrack({ id: 102, title: "Song B" });

    addToQueue(trackA);
    addToQueue(trackB);
    expect(userQueue).toHaveLength(2);
    expect(userQueue[0].title).toBe("Song A");

    removeFromUserQueue(0);
    expect(userQueue).toHaveLength(1);
    expect(userQueue[0].title).toBe("Song B");

    clearUserQueue();
    expect(userQueue).toHaveLength(0);
  });

  test("Deduplicates combined library tracks across favorites, purchases, and downloads", () => {
    const track1 = createMockRNTrack({ id: 1, title: "Duplicated Track" });
    const track2 = createMockRNTrack({ id: 1, title: "Duplicated Track" });
    const track3 = createMockRNTrack({ id: 2, title: "Unique Track" });

    const trackMap = new Map<number, RNTrack>();
    [track1, track2, track3].forEach((t) => {
      if (!trackMap.has(t.id)) {
        trackMap.set(t.id, t);
      }
    });

    const combined = Array.from(trackMap.values());
    expect(combined).toHaveLength(2);
    expect(combined.map((t) => t.id)).toEqual([1, 2]);
  });

  test("toNativeTrack sends the player a slim track carrying its queue key", () => {
    const track = createMockRNTrack({ id: 501, title: "Manual Pick", _queueKey: "q-1" });
    const native = toNativeTrack(track);
    expect(native._queueKey).toBe("q-1");
    expect(native.title).toBe("Manual Pick");
    expect(native).not.toHaveProperty("trackGroup");
  });
});


