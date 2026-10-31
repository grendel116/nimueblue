jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { toggleStationLike, useStationLikes } from "@/scripts/stationLikes";
import { findStation, registerDiscoveredStation } from "@/queries/radio";

describe("stationLikes", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  test("saving a station that is already known stores its full metadata", async () => {
    registerDiscoveredStation({
      id: "rb-known-1",
      name: "Known FM",
      liveName: "Known FM",
      location: "Oslo, Norway",
      artwork: "https://example.com/known.jpg",
      about: "",
      streamUrl: "https://example.com/known.mp3",
      playlistPage: "",
      donatePage: "",
      fetchPlays: async () => [],
    });
    await toggleStationLike("rb-known-1");

    const raw = await AsyncStorage.getItem("mirlo_blue_station_likes_v1");
    const likes = JSON.parse(raw!);
    expect(likes).toHaveLength(1);
    expect(likes[0].name).toBe("Known FM");
    expect(likes[0].streamUrl).toBe("https://example.com/known.mp3");
  });

  test("saving discovered station with track details persists full metadata", async () => {
    const mockTrack = {
      title: "Radio Solar",
      artist: "Live from Madrid, Spain",
      artwork: "https://example.com/solar.jpg",
      url: "https://example.com/solar.mp3",
      liveStation: "rb-solar-123",
    } as any;

    await toggleStationLike("rb-solar-123", mockTrack);

    const raw = await AsyncStorage.getItem("mirlo_blue_station_likes_v1");
    const likes = JSON.parse(raw!);
    expect(likes[0].stationId).toBe("rb-solar-123");
    expect(likes[0].name).toBe("Radio Solar");
    expect(likes[0].location).toBe("Madrid, Spain");
    expect(likes[0].artwork).toBe("https://example.com/solar.jpg");
    expect(likes[0].streamUrl).toBe("https://example.com/solar.mp3");

    const found = findStation("rb-solar-123");
    expect(found).toBeDefined();
    expect(found?.name).toBe("Radio Solar");
  });
});
