import {
  deduplicateRadioStations,
  fetchDiscoveredRadioStations,
  isExcludedColonialStation,
  liveTrack,
  RADICAL_RADIO_TAGS,
  RADIO_STATIONS,
  type RadioStation,
  radioBrowserToRadioStation,
  searchRadioStations,
} from "@/queries/radio";
import { RADIO_STATION_META } from "../worker/src/data/metadata.js";

describe("discovered radio stations", () => {
  test("removes duplicate stations by name, homepage, or stream while keeping the first entry", () => {
    const makeStation = (
      overrides: Partial<RadioStation>,
    ): RadioStation => ({
      id: "station",
      name: "Independent Radio",
      liveName: "Independent Radio",
      location: "Global",
      artwork: "https://example.com/art.jpg",
      about: "",
      streamUrl: "https://stream.example.com/live",
      playlistPage: "https://example.com/",
      donatePage: "https://example.com/",
      fetchPlays: async () => [],
      ...overrides,
    });

    const curated = makeStation({ id: "curated" });
    const duplicateByName = makeStation({
      id: "discovered-name",
      name: "Independent-Radio",
      streamUrl: "https://different.example.com/live",
      playlistPage: "https://different.example.com/",
    });
    const duplicateByHomepage = makeStation({
      id: "discovered-homepage",
      name: "Another Name",
      streamUrl: "https://different.example.com/other",
      playlistPage: "https://www.example.com",
    });
    const duplicateByStream = makeStation({
      id: "discovered-stream",
      name: "Third Name",
      streamUrl: "http://www.stream.example.com/live/",
      playlistPage: "https://third.example.com/",
    });
    const unique = makeStation({
      id: "unique",
      name: "Unique Station",
      streamUrl: "https://unique.example.com/live",
      playlistPage: "https://unique.example.com/",
    });
    const sameNameDifferentLocation = makeStation({
      id: "same-name-different-location",
      location: "Elsewhere",
      streamUrl: "https://elsewhere.example.com/live",
      playlistPage: "https://elsewhere.example.com/",
    });

    expect(
      deduplicateRadioStations([
        curated,
        duplicateByName,
        duplicateByHomepage,
        duplicateByStream,
        unique,
        sameNameDifferentLocation,
      ]),
    ).toEqual([curated, unique, sameNameDifferentLocation]);
  });

  test("preserves distinct non-Latin (Thai and Chinese) station names in the same location", () => {
    const makeStation = (overrides: Partial<RadioStation>): RadioStation => ({
      id: "s1",
      name: "Station",
      liveName: "Station",
      location: "China",
      artwork: "https://example.com/art.jpg",
      about: "",
      streamUrl: "https://stream1.example.com/live",
      playlistPage: "",
      donatePage: "",
      fetchPlays: async () => [],
      ...overrides,
    });

    const chinese1 = makeStation({
      id: "cn-1",
      name: "北京音乐广播",
      streamUrl: "https://stream1.example.com/live.m3u8",
    });
    const chinese2 = makeStation({
      id: "cn-2",
      name: "上海动感101",
      streamUrl: "https://stream2.example.com/live.mp3",
    });
    const thai1 = makeStation({
      id: "th-1",
      name: "บ้านใหม่ เรดิโอ",
      location: "Thailand",
      streamUrl: "https://stream3.example.com/live.mp3",
    });
    const thai2 = makeStation({
      id: "th-2",
      name: "ลานนาเรดิโอ",
      location: "Thailand",
      streamUrl: "https://stream4.example.com/live.mp3",
    });

    const deduped = deduplicateRadioStations([chinese1, chinese2, thai1, thai2]);
    expect(deduped.map((s) => s.id)).toEqual(["cn-1", "cn-2", "th-1", "th-2"]);
  });

  test("uses the full Radio-Browser UUID for server-side short-link resolution", () => {
    const station = radioBrowserToRadioStation({
      stationuuid: "11111111-1111-1111-1111-111111111111",
      name: "Shortwave",
      url: "https://example.com/stream",
      favicon: "https://example.com/art.jpg",
    });

    expect(station.id).toBe("rb-11111111111111111111111111111111");
  });

  test("assigns hls track type for .m3u8 radio streams and includes Thai and single curated Chinese station", () => {
    const bcr = RADIO_STATIONS.find((s) => s.id === "bangkok-community-radio");
    const cctv15 = RADIO_STATIONS.find((s) => s.id === "cctv-15");
    const imx = RADIO_STATIONS.find((s) => s.id === "imx-fm");
    const rthk = RADIO_STATIONS.find((s) => s.id === "rthk-radio-2");

    expect(bcr).toBeDefined();
    expect(cctv15).toBeDefined();
    expect(imx).toBeUndefined();
    expect(rthk).toBeUndefined();
    expect(liveTrack(bcr!).type).toBe("default");
    expect(liveTrack(cctv15!).type).toBe("hls");
  });

  test("worker metadata includes artwork for all curated radio stations", () => {
    const meta = RADIO_STATION_META as Record<
      string,
      { name: string; art: string; audio: string; web: string; app: string }
    >;
    for (const station of RADIO_STATIONS) {
      expect(meta[station.id]).toBeDefined();
      expect(meta[station.id].art).toBe(station.artwork);
      expect(meta[station.id].app).toBe(`/station/${station.id}`);
    }
  });

  test("excludes capitalist-colonial countries from discovered and searched stations", async () => {
    expect(
      isExcludedColonialStation({
        stationuuid: "m1",
        name: "Radio Azawan",
        url: "https://example.com/azawan",
        country: "Morocco",
      }),
    ).toBe(true);
    expect(
      isExcludedColonialStation({
        stationuuid: "i1",
        name: "Station",
        url: "https://example.com/stream",
        countrycode: "IL",
      }),
    ).toBe(true);

    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        {
          stationuuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          name: "COOL Fahrenheit 93 FM",
          url: "https://coolism-web.cdn.byteark.com/;stream/1",
          favicon: "https://static.mytuner.mobi/media/tvos_radios/KvDHAwT62s.png",
          country: "Thailand",
          language: "thai",
          tags: "thai,music",
          lastcheckok: 1,
          ssl_error: 0,
        },
        {
          stationuuid: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          name: "Radio Azawan",
          url: "https://stream.example.com/azawan.mp3",
          favicon: "https://static.mytuner.mobi/media/tvos_radios/azawan.png",
          country: "Morocco",
          countrycode: "MA",
          tags: "world music",
          lastcheckok: 1,
          ssl_error: 0,
        },
        {
          stationuuid: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          name: "Tel Aviv Stream",
          url: "https://stream.example.com/tlv.mp3",
          favicon: "https://static.mytuner.mobi/media/tvos_radios/tlv.png",
          country: "Israel",
          countrycode: "IL",
          tags: "world music",
          lastcheckok: 1,
          ssl_error: 0,
        },
      ],
    } as Response);

    try {
      const discovered = await fetchDiscoveredRadioStations();
      expect(discovered.some((s) => s.name === "COOL Fahrenheit 93 FM")).toBe(true);
      expect(discovered.some((s) => s.name === "Radio Azawan")).toBe(false);
      expect(discovered.some((s) => s.name === "Tel Aviv Stream")).toBe(false);

      const thaiResults = await searchRadioStations("thai");
      expect(thaiResults.some((s) => s.id === "bangkok-community-radio")).toBe(true);
      expect(thaiResults.some((s) => s.name === "COOL Fahrenheit 93 FM")).toBe(true);
      expect(thaiResults.some((s) => s.name === "Radio Azawan")).toBe(false);

      const chineseScriptResults = await searchRadioStations("中文");
      expect(chineseScriptResults.some((s) => s.id === "cctv-15")).toBe(true);
      expect(chineseScriptResults.some((s) => s.id === "imx-fm")).toBe(false);
      expect(chineseScriptResults.some((s) => s.id === "rthk-radio-2")).toBe(false);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("searches all discovery tags, prioritizes recent clicks, and requires quality artwork", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        {
          stationuuid: "11111111-1111-1111-1111-111111111111",
          name: "Recently Clicked",
          url: "https://example.com/recent",
          favicon: "https://example.com/recent.jpg",
          clicktimestamp: "2026-10-14T12:00:00Z",
        },
        {
          stationuuid: "22222222-2222-2222-2222-222222222222",
          name: "Older Station",
          url: "https://example.com/older",
          favicon: "https://example.com/older.jpg",
          clicktimestamp: "2026-10-13T12:00:00Z",
        },
        {
          stationuuid: "33333333-3333-3333-3333-333333333333",
          name: "Without Artwork",
          url: "https://example.com/no-art",
          clicktimestamp: "2026-10-15T12:00:00Z",
        },
        {
          stationuuid: "44444444-4444-4444-4444-444444444444",
          name: "Favicon Artwork",
          url: "https://example.com/favicon-artwork",
          favicon: "https://example.com/favicon.ico",
        },
      ],
    } as Response);

    try {
      const stations = await fetchDiscoveredRadioStations();
      expect(fetchSpy).toHaveBeenCalledTimes(RADICAL_RADIO_TAGS.length);
      for (const [endpoint] of fetchSpy.mock.calls) {
        const url = new URL(String(endpoint));
        expect(url.searchParams.get("order")).toBe("clicktimestamp");
        expect(url.searchParams.get("reverse")).toBe("true");
        expect(url.searchParams.get("hidebroken")).toBe("true");
      }
      expect(stations.map((station) => station.name)).toEqual([
        "Recently Clicked",
        "Older Station",
      ]);
      expect(stations[0].artwork).toBe("https://example.com/recent.jpg");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
