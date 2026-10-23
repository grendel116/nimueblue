import {
  DownloadedTrack,
  albumKeyOf,
  createDownloadedAlbum,
  downloadToTrack,
  findDownload,
  findSavedAlbumPage,
  findSavedArtistPage,
  getDownloadedTracks,
  groupTracksIntoAlbums,
  moveTracksToAlbum,
  removeCreatedAlbum,
  saveDownloadedTracks,
  savedAlbumSlug,
  savedArtistSlug,
  updateAlbum,
  updateDownloadedTracks,
} from "@/scripts/downloadManager";

jest.mock("react-native-track-player", () => require("../shims/react-native-track-player.web"));

import { isSameTrack } from "@/state/player/trackUtils";

const file = (id: number, title: string, order: number): DownloadedTrack => ({
  id,
  title,
  artist: "Lou Lou",
  albumTitle: "Night Swim",
  artwork: "file:///covers/night-swim.jpg",
  url: `file:///files/${id}.mp3`,
  order,
  duration: 180,
  downloadedAt: 1,
  source: "file",
});

describe("pages made from saved files", () => {
  const tracks = [file(-2, "Second Song", 2), file(-1, "First Song", 1)];
  const key = albumKeyOf(tracks[0]);

  beforeAll(() => saveDownloadedTracks(tracks));

  test("an album with no online page gets one made from its files", async () => {
    const page = await findSavedAlbumPage(savedAlbumSlug(key));
    expect(page.title).toBe("Night Swim");
    expect(page.artist.name).toBe("Lou Lou");
    expect(page.artist.urlSlug).toBe(savedArtistSlug("Lou Lou"));
    expect(page.tracks?.map((t) => t.title)).toEqual(["First Song", "Second Song"]);
    expect(page.tracks?.[0].audio?.url).toBe("file:///files/-1.mp3");
    expect(page.tracks?.[0].audio?.duration).toBe(180);
  });

  test("its artist gets a page listing the artist's saved albums", async () => {
    const artist = await findSavedArtistPage(savedArtistSlug("lou lou"));
    expect(artist.name).toBe("Lou Lou");
    expect(artist.trackGroups.map((a) => a.title)).toEqual(["Night Swim"]);
  });

  test("a song on the album's online page finds its saved file", () => {
    const online = {
      id: 9001,
      title: "First Song",
      trackGroup: { title: "Night Swim", artist: { name: "Lou Lou" } },
    };
    expect(findDownload(online)?.url).toBe("file:///files/-1.mp3");
    expect(findDownload({ ...online, title: "Not Saved" })).toBeUndefined();
  });

  test("a song playing from downloads matches as selected on the album page", () => {
    const activeTrack = downloadToTrack(file(-1, "First Song", 1));

    const onlineTrack = {
      id: 9001,
      title: "First Song",
      artist: "Lou Lou",
      url: "https://api.mirlo.space/audio/9001.mp3",
      order: 1,
      trackGroup: { title: "Night Swim", artist: { name: "Lou Lou" } },
    } as RNTrack;

    const differentTrackOnSameAlbum = {
      id: 9002,
      title: "Second Song",
      artist: "Lou Lou",
      url: "https://api.mirlo.space/audio/9002.mp3",
      order: 2,
      trackGroup: { title: "Night Swim", artist: { name: "Lou Lou" } },
    } as RNTrack;

    const sameTitleDifferentAlbum = {
      id: 9003,
      title: "First Song",
      artist: "Other Artist",
      url: "https://api.mirlo.space/audio/9003.mp3",
      order: 1,
      trackGroup: { title: "Different Album", artist: { name: "Other Artist" } },
    } as RNTrack;

    expect(isSameTrack(activeTrack, onlineTrack)).toBe(true);
    expect(isSameTrack(onlineTrack, activeTrack)).toBe(true);
    expect(isSameTrack(activeTrack, differentTrackOnSameAlbum)).toBe(false);
    expect(isSameTrack(activeTrack, sameTitleDifferentAlbum)).toBe(false);
  });

  test("creates an album folder, moves tracks into it with inherited metadata, and renames tracks", async () => {
    const createdKey = await createDownloadedAlbum("Dawn Chorus", "Skyline");
    const albumsBefore = groupTracksIntoAlbums(await getDownloadedTracks());
    const emptyAlbum = albumsBefore.find((a) => a.key === createdKey);
    expect(emptyAlbum).toMatchObject({
      title: "Dawn Chorus",
      artist: "Skyline",
      tracks: [],
    });

    await moveTracksToAlbum([-2], { title: "Dawn Chorus", artist: "Skyline" });
    await updateDownloadedTracks([-2], { title: "Morning Light" });

    const albumsAfter = groupTracksIntoAlbums(await getDownloadedTracks());
    const dawn = albumsAfter.find((a) => a.key === createdKey)!;
    expect(dawn.tracks.map((t) => ({ title: t.title, artist: t.artist, album: t.albumTitle, order: t.order }))).toEqual([
      { title: "Morning Light", artist: "Skyline", album: "Dawn Chorus", order: 1 },
    ]);

    const renamedKey = await updateAlbum(createdKey, { albumTitle: "Golden Hour", artist: "Skyline" });
    const afterRename = groupTracksIntoAlbums(await getDownloadedTracks());
    expect(afterRename.find((a) => a.key === renamedKey)?.title).toBe("Golden Hour");

    await removeCreatedAlbum(renamedKey);
  });
});
