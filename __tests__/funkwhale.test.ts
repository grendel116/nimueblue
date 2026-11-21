jest.mock("@preeternal/react-native-cookie-manager", () => ({
  __esModule: true,
  default: { get: jest.fn(), getAll: jest.fn(), clearAll: jest.fn() },
}));

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import { resetCurationConfig, setContentFilters } from "@/queries/excludedContent";
import { kvStorage } from "@/scripts/storage/kvStorage";
import { fairplayerReleaseSlug } from "@/queries/fairplayer";
import {
  decodeFunkwhaleShareToken,
  encodeFunkwhaleShareToken,
  fetchFunkwhaleAlbum,
  fetchFunkwhaleAlbums,
  fetchFunkwhaleArtist,
  formatFunkwhaleArtistCredit,
  funkwhaleReleaseSlug,
  getFunkwhaleCoverUrl,
  searchFunkwhaleCatalog,
  toFunkwhaleAlbumProps,
  toFunkwhaleTrack,
} from "@/queries/funkwhale";
import { blendCarouselReleases } from "@/scripts/carousel";
import { isQualityArtwork } from "@/scripts/utils";
import { buildShareUrl, resolveTrackSourceUrl } from "@/components/ShareTrackButton";
import { redirectSystemPath } from "@/app/+native-intent";

const MOCK_COVER = {
  uuid: "0cb62481-0ddb-4b87-993f-a6d56ba2b200",
  urls: {
    original: "https://s3.example.com/cover.png?X-Amz-Expires=3600",
    large_square_crop: "https://s3.example.com/cover-600x600.png?X-Amz-Expires=3600",
    medium_square_crop: "https://s3.example.com/cover-200x200.png?X-Amz-Expires=3600",
    small_square_crop: "https://s3.example.com/cover-50x50.png?X-Amz-Expires=3600",
  },
};

describe("Funkwhale federated catalog normalization", () => {
  beforeEach(() => {
    kvStorage.clearAll();
    resetCurationConfig();
    jest.restoreAllMocks();
  });

  test("encodes and decodes album and artist slugs including hyphenated pod domains", () => {
    const albumSlug = funkwhaleReleaseSlug.encode("my-pod.example.org", 24198);
    expect(albumSlug).toBe("funkwhale-my-pod.example.org-24198");
    expect(funkwhaleReleaseSlug.decode(albumSlug)).toEqual({
      podHost: "my-pod.example.org",
      albumId: 24198,
      releaseId: "my-pod.example.org/24198",
    });
    expect(funkwhaleReleaseSlug.decode(encodeURIComponent(albumSlug))).toEqual({
      podHost: "my-pod.example.org",
      albumId: 24198,
      releaseId: "my-pod.example.org/24198",
    });
    expect(funkwhaleReleaseSlug.artistRouteId(albumSlug)).toBe("funkwhale");
    expect(funkwhaleReleaseSlug.siteUrl(albumSlug)).toBe(
      "https://my-pod.example.org/library/albums/24198",
    );

    const artistSlug = funkwhaleReleaseSlug.encodeArtist("open.audio", 27593);
    expect(artistSlug).toBe("funkwhale-artist-open.audio-27593");
    expect(funkwhaleReleaseSlug.decodeArtist(artistSlug)).toEqual({
      podHost: "open.audio",
      artistId: 27593,
      artistKey: "open.audio/27593",
    });
    expect(funkwhaleReleaseSlug.decode(artistSlug)).toBeUndefined();
    expect(
      fairplayerReleaseSlug.artistPageRouteId({
        source: "Funkwhale",
        urlSlug: albumSlug,
        artist: { name: "M3lkocor3", urlSlug: artistSlug },
        artistId: 999,
      }),
    ).toBe(artistSlug);
  });

  test("strips @domain suffixes from artist_credit and produces non-expiring worker cover URLs", () => {
    expect(
      formatFunkwhaleArtistCredit([
        { credit: "M3lkocor3@open.audio", joinphrase: ", ", index: 0 },
        { credit: "Dudu.wav", joinphrase: "", index: 1 },
      ]),
    ).toBe("M3lkocor3, Dudu.wav");

    const coverUrl = getFunkwhaleCoverUrl({ podHost: "open.audio", albumId: 24198 });
    expect(coverUrl).toBe(
      "https://nimueblue-share.nimueblue.workers.dev/funkwhale/cover?pod=open.audio&album=24198",
    );
    expect(isQualityArtwork(coverUrl)).toBe(true);
  });

  test("normalizes Funkwhale raw album and track objects into AlbumProps and RNTrack", () => {
    const album = toFunkwhaleAlbumProps(
      {
        id: 24198,
        title: "Coaxial Propeller",
        artist_credit: [{ artist: { id: 27593 }, credit: "M3lkocor3@open.audio", joinphrase: "" }],
        cover: MOCK_COVER,
        tags: ["Electronic", "Noise"],
        creation_date: "2026-11-18T23:40:59Z",
        tracks_count: 7,
        is_playable: true,
        description: { text: "Live hardware session" },
      },
      "open.audio",
    );

    expect(album.source).toBe("Funkwhale");
    expect(album.sourceUrl).toBe("https://open.audio/library/albums/24198");
    expect(album.urlSlug).toBe("funkwhale-open.audio-24198");
    expect(album.artist.name).toBe("M3lkocor3");
    expect(album.artist.urlSlug).toBe("funkwhale-artist-open.audio-27593");
    expect(album.tags).toEqual(["electronic", "noise"]);
    expect(album.about).toBe("Live hardware session");
    expect(album.cover.sizes[600]).toBe(
      "https://nimueblue-share.nimueblue.workers.dev/funkwhale/cover?pod=open.audio&album=24198",
    );

    const track = toFunkwhaleTrack(
      {
        id: 523684,
        title: "Vilya (Mithril Forge I)",
        position: 2,
        listen_url: "/api/v2/listen/ee3ea134-43e0-424e-ba5e-487225be1030/",
        uploads: [{ duration: 359, extension: "flac" }],
        artist_credit: [{ artist: { id: 27593 }, credit: "M3lkocor3@open.audio" }],
        is_playable: true,
      },
      0,
      album,
      "open.audio",
    );

    expect(track).toBeDefined();
    expect(track?.url).toBe("https://open.audio/api/v2/listen/ee3ea134-43e0-424e-ba5e-487225be1030/");
    expect(track?.duration).toBe(359);
    expect(track?.order).toBe(2);
    expect(track?.artist).toBe("M3lkocor3");
    expect(track?.source).toBe("Funkwhale");
    expect(track?.sourceUrl).toBe("https://open.audio/library/albums/24198");
  });

  test("fetchFunkwhaleAlbums filters non-playable/coverless releases and respects client-side filters", async () => {
    setContentFilters({ excludedTerms: ["blocked"] });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 1,
            title: "Clean Synth Album",
            artist_credit: [{ artist: { id: 10 }, credit: "Ada@open.audio" }],
            cover: MOCK_COVER,
            tags: ["ambient"],
            tracks_count: 5,
            is_playable: true,
          },
          {
            id: 2,
            title: "Blocked Chart Hits",
            artist_credit: [{ artist: { id: 11 }, credit: "Spam" }],
            cover: MOCK_COVER,
            tags: ["pop"],
            tracks_count: 3,
            is_playable: true,
          },
          {
            id: 3,
            title: "No Cover Release",
            artist_credit: [{ artist: { id: 12 }, credit: "Ghost" }],
            cover: null,
            tracks_count: 2,
            is_playable: true,
          },
        ],
      }),
    } as any);

    const albums = await fetchFunkwhaleAlbums(20);
    expect(albums).toHaveLength(1);
    expect(albums[0].title).toBe("Clean Synth Album");
  });

  test("fetchFunkwhaleAlbum and fetchFunkwhaleArtist normalize complete album tracks and artist discographies", async () => {
    global.fetch = jest.fn().mockImplementation(async (input: string) => {
      if (input.includes("/api/v2/albums/24198")) {
        return {
          ok: true,
          json: async () => ({
            id: 24198,
            title: "Coaxial Propeller",
            artist_credit: [{ artist: { id: 27593 }, credit: "M3lkocor3@open.audio" }],
            cover: MOCK_COVER,
            tags: ["electronic"],
            is_playable: true,
          }),
        };
      }
      if (input.includes("/api/v2/tracks?album=24198")) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 2,
                title: "Second Track",
                position: 2,
                listen_url: "/api/v2/listen/uuid-2/",
                uploads: [{ duration: 200 }],
                is_playable: true,
              },
              {
                id: 1,
                title: "First Track",
                position: 1,
                listen_url: "/api/v2/listen/uuid-1/",
                uploads: [{ duration: 150 }],
                is_playable: true,
              },
            ],
          }),
        };
      }
      if (input.includes("/api/v2/artists/27593")) {
        return {
          ok: true,
          json: async () => ({
            id: 27593,
            name: "M3lkocor3@open.audio",
            cover: MOCK_COVER,
            is_playable: "true",
          }),
        };
      }
      if (input.includes("/api/v2/albums?artist=27593")) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 24198,
                title: "Coaxial Propeller",
                artist_credit: [{ artist: { id: 27593 }, credit: "M3lkocor3@open.audio" }],
                cover: MOCK_COVER,
                tracks_count: 2,
                is_playable: true,
              },
            ],
          }),
        };
      }
      throw new Error(`Unexpected fetch URL: ${input}`);
    }) as any;

    const album = await fetchFunkwhaleAlbum("funkwhale-open.audio-24198");
    expect(album.tracks?.map((t) => t.title)).toEqual(["First Track", "Second Track"]);

    const artist = await fetchFunkwhaleArtist("funkwhale-artist-open.audio-27593");
    expect(artist?.name).toBe("M3lkocor3");
    expect(artist?.supportUrl).toBe("https://open.audio/library/artists/27593");
    expect(artist?.trackGroups).toHaveLength(1);
  });

  test("searchFunkwhaleCatalog omits podcast-category tracks and normalizes music results", async () => {
    global.fetch = jest.fn().mockImplementation(async (input: string) => {
      if (input.includes("/api/v2/albums?")) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 100,
                title: "Ambient Tide",
                artist_credit: [{ artist: { id: 20 }, credit: "Wave@open.audio" }],
                cover: MOCK_COVER,
                tags: ["ambient"],
                is_playable: true,
              },
            ],
          }),
        };
      }
      if (input.includes("/api/v2/artists?")) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 20,
                name: "Wave@open.audio",
                cover: MOCK_COVER,
                content_category: "music",
                is_playable: "true",
              },
            ],
          }),
        };
      }
      if (input.includes("/api/v2/tracks?")) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 300,
                title: "Music Song",
                position: 1,
                listen_url: "/api/v2/listen/music-1/",
                content_category: "music",
                is_playable: true,
                album: { id: 100, title: "Ambient Tide", cover: MOCK_COVER },
              },
              {
                id: 301,
                title: "Talk Episode",
                position: 1,
                listen_url: "/api/v2/listen/pod-1/",
                content_category: "podcast",
                is_playable: true,
                album: { id: 101, title: "Podcast Feed", cover: MOCK_COVER },
              },
            ],
          }),
        };
      }
      throw new Error(`Unexpected search URL: ${input}`);
    }) as any;

    const res = await searchFunkwhaleCatalog("ambient");
    expect(res.artists.map((a) => a.name)).toEqual(["Wave"]);
    expect(res.albums.map((a) => a.title)).toEqual(["Ambient Tide"]);
    expect(res.tracks.map((t) => t.title)).toEqual(["Music Song"]);
  });

  test("blendCarouselReleases supports both 4-arg limit and 5-arg Funkwhale blending", () => {
    const makeAlbum = (id: number, name: string, source: string): AlbumProps =>
      ({
        id,
        title: `${name} Album`,
        urlSlug: `${source}-${id}`,
        artistId: id,
        artist: { id, name, urlSlug: `artist-${id}` },
        source,
      }) as unknown as AlbumProps;

    const blended = blendCarouselReleases(
      [makeAlbum(1, "Mirlo Artist", "Mirlo Space")],
      [],
      [],
      [makeAlbum(2, "Funkwhale Artist", "Funkwhale")],
      12,
    );
    expect(blended).toHaveLength(2);
    expect(blended.some((a) => a.source === "Funkwhale")).toBe(true);
  });

  test("share links and native intent round-trip Funkwhale /t/fw tokens cleanly", async () => {
    const album = toFunkwhaleAlbumProps(
      {
        id: 24198,
        title: "Coaxial Propeller",
        artist_credit: [{ artist: { id: 27593 }, credit: "M3lkocor3@open.audio" }],
        cover: MOCK_COVER,
      },
      "open.audio",
    );
    const track = toFunkwhaleTrack(
      {
        id: 523684,
        title: "Vilya",
        position: 2,
        listen_url: "/api/v2/listen/ee3ea134/",
        is_playable: true,
      },
      1,
      album,
      "open.audio",
    )!;

    expect(resolveTrackSourceUrl(track)).toBe("https://open.audio/library/albums/24198");
    const shareUrl = buildShareUrl(track);
    const expectedToken = encodeFunkwhaleShareToken("open.audio/24198", 2);
    expect(shareUrl).toBe(`https://nimueblue-share.nimueblue.workers.dev/t/${expectedToken}`);
    expect(decodeFunkwhaleShareToken(expectedToken)).toEqual({
      podHost: "open.audio",
      albumId: 24198,
      trackOrder: "2",
    });

    const resolvedIntent = await redirectSystemPath({ path: shareUrl, initial: false });
    expect(resolvedIntent).toBe(
      "/artist/funkwhale/album/funkwhale-open.audio-24198/album-tracks?trackOrder=2",
    );
  });
});
