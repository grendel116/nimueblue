jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("react-native-track-player", () => ({
  __esModule: true,
  default: {
    setupPlayer: jest.fn(),
    add: jest.fn(),
    remove: jest.fn(),
    getQueue: jest.fn().mockResolvedValue([]),
    getActiveTrack: jest.fn().mockResolvedValue(undefined),
    getActiveTrackIndex: jest.fn().mockResolvedValue(-1),
    getRepeatMode: jest.fn().mockResolvedValue(0),
    addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  },
  State: { None: "none", Ready: "ready", Playing: "playing", Paused: "paused", Stopped: "stopped", Buffering: "buffering" },
  Event: { PlaybackState: "playback-state", PlaybackActiveTrackChanged: "playback-active-track-changed" },
  RepeatMode: { Off: 0, Track: 1, Queue: 2 },
  AppKilledPlaybackBehavior: {
    StopPlaybackAndRemoveNotification: "stopPlaybackAndRemoveNotification",
  },
  Capability: {
    Play: "play",
    Pause: "pause",
    Stop: "stop",
    SkipToNext: "skipToNext",
    SkipToPrevious: "skipToPrevious",
    SeekTo: "seekTo",
  },
  TrackType: {
    Default: "default",
    HLS: "hls",
    Dash: "dash",
  },
  IOSCategory: { Playback: "playback" },
  IOSCategoryOptions: {
    AllowAirPlay: "allowAirPlay",
    AllowBluetoothA2DP: "allowBluetoothA2DP",
    AllowBluetooth: "allowBluetooth",
    DuckOthers: "duckOthers",
  },
  usePlaybackState: jest.fn().mockReturnValue({ state: undefined }),
  useTrackPlayerEvents: jest.fn(),
}));

jest.mock("expo-file-system", () => ({
  documentDirectory: "file:///mock/documents/",
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
}));

import {
  buildBookmarks,
  buildFollowedArtists,
  buildWishlistAlbums,
} from "@/scripts/library";
import { createMockRNTrack } from "@/__mocks__/mockRNTrack";
import { createMockArtist } from "@/__mocks__/mockArtist";

const album = (id: number, urlSlug: string, title: string) =>
  ({
    id,
    trackGroupId: id,
    title,
    artist: createMockArtist({ name: "Duo" }),
    artistId: 10,
    urlSlug,
    releaseDate: "2025-01-01T00:00:00.000Z",
    cover: { sizes: { 60: "", 120: "", 300: "", 600: "", 960: "", 1200: "", 1500: "" } },
  }) as AlbumProps;

describe("buildWishlistAlbums", () => {
  test("lists locally saved albums, newest first", () => {
    const albums = buildWishlistAlbums({
      faircampSaves: {
        albums: [
          {
            album: album(701, "mirlo-album", "Mirlo Album"),
            savedAt: Date.parse("2025-02-01T00:00:00.000Z"),
          },
          {
            album: album(801, "fairplayer-saved", "Saved Faircamp Album"),
            savedAt: Date.parse("2025-03-01T00:00:00.000Z"),
          },
        ],
        tracks: [],
        artists: [],
      },
    });

    expect(albums.map((a) => a.trackGroup.title)).toEqual([
      "Saved Faircamp Album",
      "Mirlo Album",
    ]);
  });

  test("a liked song brings its album, listed once", () => {
    const targetAlbum = album(901, "liked-album", "Liked Album");
    const song = (id: number, likedAt: string) => ({
      track: createMockRNTrack({ id, trackGroup: targetAlbum }),
      likedAt: Date.parse(likedAt),
    });

    const albums = buildWishlistAlbums({
      faircampSaves: {
        albums: [],
        tracks: [song(1, "2025-04-01T00:00:00.000Z"), song(2, "2025-05-01T00:00:00.000Z")],
        artists: [],
      },
    });

    expect(albums).toHaveLength(1);
    expect(albums[0].trackGroup.title).toBe("Liked Album");
    expect(albums[0].savedAt).toBe(Date.parse("2025-05-01T00:00:00.000Z"));
  });

  test("leaves out albums already downloaded to the device", () => {
    const albums = buildWishlistAlbums({
      faircampSaves: {
        albums: [
          { album: album(801, "owned", "Bought & Saved!"), savedAt: 2 },
          { album: album(802, "wanted", "Still Wanted"), savedAt: 1 },
        ],
        tracks: [],
        artists: [],
      },
      downloads: [
        {
          id: -1,
          title: "Song",
          artist: "Duo",
          albumTitle: "bought & saved",
          url: "file:///music/song.mp3",
          downloadedAt: 3,
          source: "file",
        },
      ],
    });

    expect(albums.map((a) => a.trackGroup.title)).toEqual(["Still Wanted"]);
  });
});

describe("buildFollowedArtists", () => {
  test("lists locally followed artists across sources", () => {
    const mirloArtist = createMockArtist({ id: 10, name: "Mirlo Band", urlSlug: "mirlo-band" });
    const faircampArtist = createMockArtist({
      id: 99,
      name: "Sockpuppet",
      urlSlug: "fairplayer-artist-Sockpuppet",
      onMirlo: false,
    });

    const followed = buildFollowedArtists({
      faircampSaves: {
        albums: [],
        tracks: [],
        artists: [
          { artist: mirloArtist, followedAt: 2000 },
          { artist: faircampArtist, followedAt: 1000 },
        ],
      },
    });

    expect(followed.map((f) => f.artist.name)).toEqual(["Mirlo Band", "Sockpuppet"]);
  });
});

describe("buildBookmarks", () => {
  test("lists bookmarked radio stations and podcast shows, newest first", () => {
    const items = buildBookmarks({
      stationLikes: [{ stationId: "kexp", likedAt: 1000 }],
      podcastShows: [
        {
          showId: "upstream",
          name: "Upstream Podcast",
          author: "Cooperative Business",
          artwork: "https://example.com/upstream.jpg",
          bookmarkedAt: 2000,
        },
      ],
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "show", show: { showId: "upstream" } });
    expect(items[1].kind).toBe("station");
    expect((items[1] as { track: RNTrack }).track.title).toBe("KEXP 90.3 FM");
  });
});
