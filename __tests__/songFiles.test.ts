import {
  albumFolderPath,
  buildMusicFolderManifest,
  folderAlbumAndArtist,
  folderChanges,
  isManifestFileName,
  matchTrack,
  namesFromFile,
  parseMusicFolderManifest,
  pickCover,
  songDetails,
  songFileName,
  targetTrackPath,
} from "@/scripts/songFiles";
import {
  DownloadedTrack,
  groupTracksIntoAlbums,
  linkedTrack,
  mergeAlbumWithDownloads,
  storedTrack,
} from "@/scripts/downloadManager";

const tracks = [
  { id: 11, title: "Opening", order: 1 },
  { id: 12, title: "Second Song", order: 2 },
];

describe("matchTrack", () => {
  it("ties a song to its Mirlo track by tagged title", () => {
    expect(matchTrack({ title: " second song " }, "xx.flac", tracks)?.id).toBe(12);
  });

  it("falls to the track number from tags, then from Mirlo's file name", () => {
    expect(matchTrack({ track: 1 }, "x.mp3", tracks)?.id).toBe(11);
    expect(matchTrack({}, "2-Second Song.mp3", tracks)?.id).toBe(12);
    expect(matchTrack({}, "Bonus.mp3", tracks)).toBeUndefined();
  });
});

describe("names and paths", () => {
  it("reads track number, artist and title from a file name", () => {
    expect(namesFromFile("01 - Band - Tune.mp3")).toEqual({ track: 1, artist: "Band", title: "Tune" });
    expect(namesFromFile("Tune.flac")).toEqual({ track: undefined, artist: "", title: "Tune" });
  });

  it("builds safe album folders and song names", () => {
    expect(albumFolderPath("AC/DC", "Back: In Black...")).toBe("AC_DC/Back_ In Black");
    expect(albumFolderPath("", undefined)).toBe("Unknown Artist/Untitled");
    expect(songFileName(3, "Why?", "flac")).toBe("03 Why_.flac");
    expect(songFileName(undefined, "Tune", "mp3")).toBe("Tune.mp3");
  });

  it("describes a song by tags, then file name, then folder", () => {
    expect(songDetails({ title: "T" }, "05 - A - Name.mp3", 0, "Folder Album")).toEqual({
      title: "T",
      artist: "A",
      albumTitle: "Folder Album",
      order: 5,
    });
    expect(songDetails({}, "Name.mp3", 2)).toEqual({
      title: "Name",
      artist: "Unknown Artist",
      albumTitle: "Imported Audio",
      order: 3,
    });
  });
});

describe("music folder scans", () => {
  it("finds songs whose files are gone and files not saved yet", () => {
    const saved = [
      { id: 1, path: "A/B/1.mp3" },
      { id: 2, path: "A/B/2.mp3" },
      { id: 3 }, // a song outside the music folder stays
    ];
    expect(folderChanges(saved, ["A/B/1.mp3", "C/new.flac"])).toEqual({
      gone: [2],
      added: ["C/new.flac"],
    });
  });

  it("prefers a cover image by name", () => {
    expect(pickCover(["A/back.jpg", "A/Cover.PNG"])).toBe("A/Cover.PNG");
    expect(pickCover(["A/back.jpg"])).toBe("A/back.jpg");
    expect(pickCover([])).toBeUndefined();
  });
});

describe("saved song records", () => {
  const base: DownloadedTrack = {
    id: 5,
    title: "Tune",
    artist: "Band",
    url: "blob:old",
    artwork: "blob:cover",
    downloadedAt: 1,
    source: "mirlo",
  };

  it("stores songs in the music folder by path alone", () => {
    const inFolder = { ...base, path: "Band/Album/01 Tune.mp3", coverPath: "Band/Album/cover.jpg" };
    expect(storedTrack(inFolder)).toEqual({ ...inFolder, url: "", artwork: undefined });
    expect(storedTrack(base)).toBe(base);
  });

  it("links stored songs to browser files when the folder is open", () => {
    const stored = { ...base, url: "", artwork: undefined, path: "p.mp3", coverPath: "c.jpg" };
    const links = { audio: new Map([["p.mp3", "blob:a"]]), covers: new Map([["c.jpg", "blob:c"]]) };
    expect(linkedTrack(stored, links)).toMatchObject({ url: "blob:a", artwork: "blob:c" });
    expect(linkedTrack(stored, { audio: new Map(), covers: new Map() }).url).toBe("");
    expect(linkedTrack(base, links)).toBe(base);
  });

  it("computes universal schema flat track paths in /music and parses them back on rescan", () => {
    expect(
      targetTrackPath({
        title: "New Name",
        artist: "My Artist",
        albumTitle: "My Album",
        order: 2,
        path: "Old Artist/Old Album/01 Old Name.flac",
      }),
    ).toEqual({
      dirPath: "",
      fileName: "My Artist - My Album - 02 - New Name.flac",
      fullPath: "My Artist - My Album - 02 - New Name.flac",
    });

    expect(namesFromFile("My Artist - My Album - 02 - New Name.flac")).toEqual({
      artist: "My Artist",
      album: "My Album",
      track: 2,
      title: "New Name",
    });

    expect(songDetails({}, "My Artist - My Album - 02 - New Name.flac", 0)).toEqual({
      title: "New Name",
      artist: "My Artist",
      albumTitle: "My Album",
      order: 2,
    });

    expect(folderAlbumAndArtist("My Artist/My Album")).toEqual({
      artist: "My Artist",
      album: "My Album",
    });
  });

  it("pairs loose downloaded tracks with online album tracks, inherits album artist, and strips .mp3 from titles", () => {
    const onlineAlbum = {
      id: 3613,
      title: "Prigioniero",
      artist: { name: "Politburo " },
      tracks: [
        {
          id: 21647,
          title: "Aiuto",
          order: 1,
          isPreview: true,
          url: "https://api.mirlo.space/v1/tracks/21647/stream/playlist.m3u8",
          trackArtists: [{ artistName: "F. Cecere-E. Cecere S. Bellissima" }],
        },
        {
          id: 21650,
          title: "Marie Josè",
          order: 4,
          isPreview: true,
          url: "https://api.mirlo.space/v1/tracks/21650/stream/playlist.m3u8",
          trackArtists: [{ artistName: "F. Cecere-E. Cecere S. Bellissima" }],
        },
        {
          id: 21655,
          title: "Tradito.mp3",
          order: 8,
          isPreview: true,
          url: "https://api.mirlo.space/v1/tracks/21655/stream/playlist.m3u8",
          trackArtists: [{ artistName: "fabio cecere" }],
        },
      ],
    } as unknown as AlbumProps;

    const allDownloads: DownloadedTrack[] = [
      {
        id: -101,
        title: "Aiuto",
        artist: "F. Cecere-E. Cecere S. Bellissima",
        albumTitle: "Imported Audio",
        order: 1,
        duration: 269,
        url: "file:///music/Aiuto.mp3",
        downloadedAt: 1,
        source: "file",
      },
      {
        id: -104,
        title: "Marie Jose",
        artist: "F. Cecere-E. Cecere S. Bellissima",
        albumTitle: "Prigioniero",
        order: 4,
        duration: 205,
        url: "file:///music/Marie Jose.mp3",
        downloadedAt: 2,
        source: "file",
      },
      {
        id: -108,
        title: "Tradito",
        artist: "Politburo",
        albumTitle: "Prigioniero",
        order: 8,
        duration: 197,
        url: "file:///music/Tradito.mp3",
        downloadedAt: 3,
        source: "file",
      },
    ];

    const savedAlbum = groupTracksIntoAlbums(allDownloads).find((a) => a.title === "Prigioniero");
    const merged = mergeAlbumWithDownloads(onlineAlbum, savedAlbum, allDownloads);
    expect(
      merged.tracks?.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        trackArtists: t.trackArtists,
        isPreview: t.isPreview,
        url: t.url,
      })),
    ).toEqual([
      {
        id: -101,
        title: "Aiuto",
        artist: "Politburo",
        trackArtists: undefined,
        isPreview: false,
        url: "file:///music/Aiuto.mp3",
      },
      {
        id: -104,
        title: "Marie Jose",
        artist: "Politburo",
        trackArtists: undefined,
        isPreview: false,
        url: "file:///music/Marie Jose.mp3",
      },
      {
        id: -108,
        title: "Tradito",
        artist: "Politburo",
        trackArtists: undefined,
        isPreview: false,
        url: "file:///music/Tradito.mp3",
      },
    ]);
  });

  it("serializes and parses nimue-library.json in the Faircamp/Mirlo universal schema", () => {
    expect(isManifestFileName("nimue-library.json")).toBe(true);
    expect(isManifestFileName("A/nimue-library.json")).toBe(true);
    expect(isManifestFileName("song.mp3")).toBe(false);

    const manifest = buildMusicFolderManifest(
      [
        {
          id: -1,
          path: "01 Aiuto.mp3",
          title: "Aiuto",
          artist: "Politburo",
          albumTitle: "Prigioniero",
          order: 1,
          duration: 269,
        },
      ],
      [
        {
          key: "album:prigioniero",
          title: "Prigioniero",
          artist: "Politburo",
          artwork: "cover.jpg",
          createdAt: 1000,
        },
      ],
    );

    expect(manifest.albums["album:prigioniero"]).toEqual({
      title: "Prigioniero",
      artist: "Politburo",
      artwork: "cover.jpg",
      createdAt: 1000,
    });
    expect(manifest.tracks["01 Aiuto.mp3"]).toMatchObject({
      title: "Aiuto",
      albumKey: "album:prigioniero",
      order: 1,
      duration: 269,
    });

    const parsed = parseMusicFolderManifest(JSON.stringify(manifest));
    expect(parsed).toEqual(manifest);
  });

  it("merges online album tracks with downloaded tracks and appends extra or duplicate downloads", () => {
    const onlineAlbum = {
      id: 100,
      title: "Faircamp Release",
      artist: { name: "Synth Artist" },
      tracks: [
        { id: 10, title: "Opening", order: 1, url: "https://example.com/1.mp3" },
        { id: 11, title: "Middle", order: 2, url: "https://example.com/2.mp3" },
      ],
    } as unknown as AlbumProps;

    const savedTracks: DownloadedTrack[] = [
      {
        id: -1,
        title: "Opening",
        artist: "Synth Artist",
        albumTitle: "Faircamp Release",
        order: 1,
        duration: 180,
        url: "file:///music/1.flac",
        downloadedAt: 1,
        source: "file",
      },
      {
        id: -2,
        title: "Opening",
        artist: "Synth Artist",
        albumTitle: "Faircamp Release",
        order: 1,
        duration: 180,
        url: "file:///music/1-copy.flac",
        downloadedAt: 2,
        source: "file",
      },
      {
        id: -3,
        title: "Middle (Renamed)",
        artist: "Synth Artist",
        albumTitle: "Faircamp Release",
        order: 2,
        duration: 200,
        url: "file:///music/2.flac",
        downloadedAt: 3,
        source: "file",
      },
      {
        id: -4,
        title: "Secret Bonus Track",
        artist: "Synth Artist",
        albumTitle: "Faircamp Release",
        order: 3,
        duration: 240,
        url: "file:///music/3.flac",
        downloadedAt: 4,
        source: "file",
      },
    ];

    const savedAlbum = groupTracksIntoAlbums(savedTracks)[0];
    const merged = mergeAlbumWithDownloads(onlineAlbum, savedAlbum);
    expect(merged.tracks?.map((t) => ({ id: t.id, title: t.title, order: t.order }))).toEqual([
      { id: -1, title: "Opening", order: 1 },
      { id: -2, title: "Opening", order: 1 },
      { id: -3, title: "Middle (Renamed)", order: 2 },
      { id: -4, title: "Secret Bonus Track", order: 3 },
    ]);
  });
});
