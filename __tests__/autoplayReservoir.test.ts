import {
  getDiscoveryReservoir,
  saveDiscoveryReservoir,
  drawFromReservoir,
  recordPlayedDiscoveryId,
  getPlayedDiscoveryIds,
  DISCOVERY_POOL_KEY,
  DISCOVERY_PLAYED_KEY,
} from "@/scripts/autoplay";
import { kvStorage } from "@/scripts/storage/kvStorage";
import * as Q from "@/state/player/queueModel";

const dummyTrack = (id: number): RNTrack =>
  ({
    id,
    title: `Track ${id}`,
    artist: "Artist",
    url: `https://example.com/${id}.mp3`,
    autoplay: true,
  }) as RNTrack;

describe("Discovery Reservoir & Offline Queue", () => {
  beforeEach(() => {
    kvStorage.clearAll();
  });

  test("persists and loads reservoir from kvStorage", () => {
    expect(getDiscoveryReservoir()).toEqual([]);

    const tracks = [dummyTrack(1), dummyTrack(2), dummyTrack(3)];
    saveDiscoveryReservoir(tracks);

    const loaded = getDiscoveryReservoir();
    expect(loaded).toHaveLength(3);
    expect(loaded[0].id).toBe(1);
    expect(loaded[1].id).toBe(2);
    expect(loaded[2].id).toBe(3);
  });

  test("synchronously draws fresh tracks and updates remaining reservoir", () => {
    const tracks = [dummyTrack(10), dummyTrack(11), dummyTrack(12), dummyTrack(13)];
    saveDiscoveryReservoir(tracks);

    const knownIds = new Set<string | number>([10]); // Track 10 is already known
    const knownUrls = new Set<string>();

    const drawn = drawFromReservoir(2, knownIds, knownUrls);
    expect(drawn).toHaveLength(2);
    expect(drawn[0].id).toBe(11);
    expect(drawn[1].id).toBe(12);

    // Remaining in reservoir should only be track 13
    const remaining = getDiscoveryReservoir();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(13);

    // Track 11 and 12 are recorded in played discovery IDs
    const played = getPlayedDiscoveryIds();
    expect(played.has(11)).toBe(true);
    expect(played.has(12)).toBe(true);
  });

  test("recordPlayedDiscoveryId deduplicates and bounds history", () => {
    recordPlayedDiscoveryId(101);
    recordPlayedDiscoveryId(102);
    const played = getPlayedDiscoveryIds();
    expect(played.has(101)).toBe(true);
    expect(played.has(102)).toBe(true);
    expect(played.has(103)).toBe(false);
  });

  test("offline playOrder keeps discovery in state but omits from audio player queue", () => {
    let state = Q.play(Q.emptyQueue, [dummyTrack(1), dummyTrack(2)], 0, "Test Album");
    state = Q.addDiscovery(state, [dummyTrack(50), dummyTrack(51)], state.generation);

    expect(state.discovery).toHaveLength(2);

    // Online: playOrder includes discovery tracks
    const onlineOrder = Q.playOrder(state, { isOnline: true });
    expect(onlineOrder.tracks.map((t) => t.id)).toEqual([1, 2, 50, 51]);

    // Offline: playOrder excludes discovery tracks without pruning state.discovery
    const offlineOrder = Q.playOrder(state, { isOnline: false });
    expect(offlineOrder.tracks.map((t) => t.id)).toEqual([1, 2]);

    // State discovery tracks remain safely stored and preserved!
    expect(state.discovery).toHaveLength(2);
  });

  test("offline advance does not cross into discovery tracks", () => {
    let state = Q.play(Q.emptyQueue, [dummyTrack(1)], 0, "Single Track");
    state = Q.addDiscovery(state, [dummyTrack(88), dummyTrack(89)], state.generation);

    // Offline advance when Next Up is empty: does not take discovery
    const nextOffline = Q.advance(state, 1, false);
    expect(nextOffline.current?.track.id).toBe(1); // Stays or doesn't move to 88

    // Online advance: moves cleanly to discovery track
    const nextOnline = Q.advance(state, 1, true);
    expect(nextOnline.current?.track.id).toBe(88);
  });
});
