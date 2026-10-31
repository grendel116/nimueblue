jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { toggleStationLike, useStationLikes } from "@/scripts/stationLikes";
import { findStation } from "@/queries/radio";

describe("stationLikes", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  test("saving KS CHITRA populates complete station metadata and registers station", async () => {
    await toggleStationLike("rb-0dfae06a5e7b438aa509aaacd94bc6b2");

    const raw = await AsyncStorage.getItem("mirlo_blue_station_likes_v1");
    expect(raw).toBeTruthy();
    const likes = JSON.parse(raw!);
    expect(likes).toHaveLength(1);
    expect(likes[0].stationId).toBe("rb-0dfae06a5e7b438aa509aaacd94bc6b2");
    expect(likes[0].name).toBe("KS CHITRA");
    expect(likes[0].artwork).toBe("https://liveradios.in/wp-content/uploads/ks-chitra.jpg");
    expect(likes[0].streamUrl).toContain("zeno.fm");

    const registered = findStation("rb-0dfae06a5e7b438aa509aaacd94bc6b2");
    expect(registered).toBeDefined();
    expect(registered?.name).toBe("KS CHITRA");
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
