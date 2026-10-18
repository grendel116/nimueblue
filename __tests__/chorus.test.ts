jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("react-native-track-player", () => ({
  __esModule: true,
  default: {
    getQueue: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue(undefined),
  },
  TrackType: { HLS: "hls", DEFAULT: "default" },
}));

import {
  parseChorusFeed,
  chorusTrackToRNTrack,
  chorusToAlbums,
  fetchChorusFeed,
  resolveFeedSourceName,
  distributeFairChorusAlbums,
} from "@/queries/chorus";
import type { ChorusRoot } from "@/types/chorus";

describe("Chorus Protocol parser & converter", () => {
  const sampleFeed: ChorusRoot = {
    type: "root",
    url: "https://mirlo.space",
    children: [
      {
        type: "artist",
        name: "Jessica Moss",
        url: "https://mirlo.space/jessica-moss",
        images: {
          cover: {
            src: "https://cdn.mirlo.space/artist-cover.jpg",
            width: 600,
            height: 600,
          },
        },
        summary: "Solo violinist and composer",
        description: "Solo praxis shaped by holding space and deep listening",
        children: [
          {
            type: "album",
            uid: "4594",
            name: "For UNRWA",
            url: "https://mirlo.space/jessica-moss/release/for-unrwa",
            release_date: "2024-03-01",
            license: "Constellation",
            artist: "Jessica Moss",
            images: {
              cover: {
                src: "https://cdn.mirlo.space/album-cover.webp",
                width: 600,
                height: 600,
              },
            },
            description: "Live set recorded at Morphine Raum, Berlin",
            children: [
              {
                type: "track",
                id: "27376",
                name: "For UNRWA (Live)",
                url: "https://mirlo.space/jessica-moss/release/for-unrwa/tracks/27376",
                duration: 2525,
                track: 1,
                media: [
                  {
                    src: "https://mirlo.space/v1/tracks/27376/stream/external/playlist.m3u8",
                    type: "audio/x-mpegurl",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "artist",
        name: "Opted Out Artist",
        url: "https://mirlo.space/opted-out",
        children: [
          {
            type: "album",
            name: "Removed Album",
            url: "https://mirlo.space/opted-out/release/removed-album",
            children: [],
          },
        ],
      },
    ],
    deleted: [
      {
        type: "artist",
        name: "Opted Out Artist",
        url: "https://mirlo.space/opted-out",
      },
    ],
  };

  test("parses a valid feed and falls back safely on invalid input", () => {
    const parsed = parseChorusFeed(sampleFeed);
    expect(parsed.type).toBe("root");
    expect(parsed.children.length).toBe(2);
    expect(parsed.deleted?.length).toBe(1);

    const empty = parseChorusFeed(null);
    expect(empty.type).toBe("root");
    expect(empty.children).toEqual([]);
    expect(empty.deleted).toEqual([]);
  });

  test("converts a Chorus track to an RNTrack with external stream headers", () => {
    const artist = sampleFeed.children[0];
    const album = artist.children![0];
    const track = album.children![0];

    const rnTrack = chorusTrackToRNTrack(
      track,
      album,
      artist.name,
      0,
      album.images!.cover!.src,
      sampleFeed.url,
    );

    expect(rnTrack.id).toBe(27376);
    expect(rnTrack.title).toBe("For UNRWA (Live)");
    expect(rnTrack.artist).toBe("Jessica Moss");
    expect(rnTrack.url).toBe("https://mirlo.space/v1/tracks/27376/stream/external/playlist.m3u8");
    expect(rnTrack.type).toBe("hls");
    expect(rnTrack.duration).toBe(2525);
    expect(rnTrack.headers).toHaveProperty("social-music-userid");
  });

  test("converts Chorus albums and respects artist revocation / deleted entities", () => {
    const albums = chorusToAlbums(sampleFeed);

    // Jessica Moss is kept, Opted Out Artist is purged per deleted array
    expect(albums.length).toBe(1);
    expect(albums[0].title).toBe("For UNRWA");
    expect(albums[0].artist.name).toBe("Jessica Moss");
    expect(albums[0].tracks?.length).toBe(1);
    expect(albums[0].cover.sizes[600]).toBe("https://cdn.mirlo.space/album-cover.webp");
  });

  test("fetchChorusFeed serializes parameters correctly", async () => {
    const originalFetch = global.fetch;
    let requestedUrl = "";

    global.fetch = jest.fn().mockImplementation((url: string) => {
      requestedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(sampleFeed),
      });
    }) as any;

    try {
      const result = await fetchChorusFeed({
        host: "https://custom.node",
        endpoint: "/v1/sm/canimus.json",
        skip: 10,
        take: 20,
        fromDate: "2026-01-01T00:00:00Z",
      });

      expect(requestedUrl).toContain("https://custom.node/v1/sm/canimus.json?");
      expect(requestedUrl).toContain("skip=10");
      expect(requestedUrl).toContain("take=20");
      expect(requestedUrl).toContain("fromDate=2026-01-01T00%3A00%3A00Z");
      expect(result.children.length).toBe(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("extracts tags from array tags and embedded hashtags", () => {
    const { extractChorusTags } = require("@/queries/chorus");

    const tags = extractChorusTags(
      ["ambient", "#experimental"],
      "Album description with #instrumental and #electronic",
      "Artist bio with #postrock",
    );

    expect(tags).toContain("ambient");
    expect(tags).toContain("experimental");
    expect(tags).toContain("instrumental");
    expect(tags).toContain("electronic");
    expect(tags).toContain("postrock");
  });

  test("shuffle produces a shuffled copy containing all stations without mutating original", () => {
    const { shuffle } = require("@/scripts/utils");

    const stations = [
      { id: "s1", name: "Station 1" },
      { id: "s2", name: "Station 2" },
      { id: "s3", name: "Station 3" },
      { id: "s4", name: "Station 4" },
      { id: "s5", name: "Station 5" },
    ];

    const shuffled = shuffle(stations);
    expect(shuffled.length).toBe(stations.length);
    expect(new Set(shuffled.map((s: { id: string }) => s.id))).toEqual(
      new Set(stations.map((s) => s.id)),
    );
    // Original array is not mutated
    expect(stations[0].id).toBe("s1");
    expect(stations[4].id).toBe("s5");
  });

  test("fetchFederatedChorusAlbums reads the configured Mirlo catalog", async () => {
    const { fetchFederatedChorusAlbums } = require("@/queries/chorus");

    const originalFetch = global.fetch;
    const mirloFeed = {
      type: "root",
      url: "https://mirlo.space",
      children: [
        {
          type: "artist",
          name: "Mirlo Artist",
          url: "https://mirlo.space/mirlo-artist",
          children: [
            {
              type: "album",
              uid: "101",
              name: "Mirlo Album",
              url: "https://mirlo.space/mirlo-artist/release/mirlo-album",
              children: [],
            },
          ],
        },
      ],
      deleted: [],
    };

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes("mirlo.space")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mirloFeed),
        });
      }
      return Promise.reject(new Error("Unknown host"));
    });

    try {
      const albums = await fetchFederatedChorusAlbums();
      expect(albums.length).toBe(1);
      const titles = albums.map((a: { title: string }) => a.title);
      expect(titles).toContain("Mirlo Album");

      const mirloAlbum = albums.find((a: { title: string; source?: string }) => a.title === "Mirlo Album");
      expect(mirloAlbum?.source).toBe("Mirlo Space");
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("resolveFeedSourceName correctly identifies innate and third-party origins", () => {
    expect(resolveFeedSourceName("https://mirlo.space")).toBe("Mirlo Space");
    expect(resolveFeedSourceName("https://faircamp.example/audio/track1.mp3")).toBe("faircamp.example");
    expect(resolveFeedSourceName("https://indie-station.org/feed.json")).toBe("indie-station.org");
    expect(resolveFeedSourceName("/v1/tracks/123")).toBe("Mirlo Space");
    expect(resolveFeedSourceName(undefined)).toBe("Mirlo Space");
  });

  test("distributeFairChorusAlbums caps representation per artist fairly", () => {
    const mockAlbums = [
      { id: 1, title: "Sockpuppet 1", artist: { name: "Sockpuppet" } },
      { id: 2, title: "Sockpuppet 2", artist: { name: "Sockpuppet" } },
      { id: 3, title: "Sockpuppet 3", artist: { name: "Sockpuppet" } },
      { id: 4, title: "Sockpuppet 4", artist: { name: "Sockpuppet" } },
      { id: 5, title: "Porcupine 1", artist: { name: "Fluffy Porcupine" } },
      { id: 6, title: "Monolalia 1", artist: { name: "Monolalia" } },
    ] as any[];

    const balanced = distributeFairChorusAlbums(mockAlbums, 2);
    expect(balanced.length).toBe(4);
    const sockpuppetItems = balanced.filter((a) => a.artist.name === "Sockpuppet");
    expect(sockpuppetItems.length).toBe(2);
    expect(balanced.some((a) => a.artist.name === "Fluffy Porcupine")).toBe(true);
    expect(balanced.some((a) => a.artist.name === "Monolalia")).toBe(true);
  });
});
