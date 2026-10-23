import {
  DownloadedAlbum,
  DownloadedTrack,
  createDownloadedAlbum,
  forgetDownloadedTracks,
  getDownloadedTracks,
  groupTracksIntoAlbums,
  moveTracksToAlbum,
  removeCreatedAlbum,
  updateAlbum,
  updateDownloadedTracks,
} from "./downloadManager";
import { IMAGE_FILE } from "./songFiles";
import {
  createAlbumInMusicFolder,
  removeFile,
  syncTracksInMusicFolder,
} from "./musicFolder.web";
import { IN_NATIVE_SHELL, askNative } from "./nativeShell";

// The browser adds your own music through the music folder, so picking album covers stays
// with the phone, which the Android app reaches through its shell
export const PICKS_PHONE_FILES = IN_NATIVE_SHELL;

// Downloads unpack directly into the listener's music folder on Chromium browsers; the
// Android app hands them to the phone's browser instead
export const CAN_DOWNLOAD =
  IN_NATIVE_SHELL || (typeof window !== "undefined" && "showDirectoryPicker" in window);

// Deletes saved songs from the music folder, then the covers no saved song uses any more
export async function removeDownloads(
  tracks: DownloadedTrack[],
  albumKey?: string,
): Promise<void> {
  if (IN_NATIVE_SHELL) {
    return askNative("removeDownloads", { ids: tracks.map((t) => t.id), albumKey });
  }
  for (const t of tracks) if (t.path) await removeFile(t.path);
  if (tracks.length > 0) await forgetDownloadedTracks(tracks.map((t) => t.id));
  if (albumKey) await removeCreatedAlbum(albumKey);
  await syncTracksInMusicFolder();

  const inUse = new Set((await getDownloadedTracks()).map((t) => t.coverPath));
  const covers = new Set(tracks.map((t) => t.coverPath));
  for (const cover of covers) {
    if (cover && IMAGE_FILE.test(cover) && !inUse.has(cover)) await removeFile(cover);
  }
}

// The Android app lets you pick an album's cover from the phone
export async function chooseAlbumCover(album: DownloadedAlbum): Promise<void> {
  if (IN_NATIVE_SHELL) return askNative("chooseAlbumCover", { key: album.key });
}

export async function createAlbumFolder(title: string, artist: string): Promise<string> {
  if (IN_NATIVE_SHELL) return askNative<string>("createAlbumFolder", { title, artist });
  const key = await createDownloadedAlbum(title, artist);
  await createAlbumInMusicFolder(title, artist);
  return key;
}

export async function editAlbumMetadata(
  albumKey: string,
  changes: { albumTitle?: string; artist?: string },
  extraTrackIds?: number[],
): Promise<string> {
  if (IN_NATIVE_SHELL) {
    return askNative<string>("editAlbumMetadata", { albumKey, changes, extraTrackIds });
  }
  const nextKey = await updateAlbum(albumKey, changes, extraTrackIds);
  const album = groupTracksIntoAlbums(await getDownloadedTracks()).find((a) => a.key === nextKey);
  if (album) {
    if (album.tracks.length > 0) {
      await syncTracksInMusicFolder(album.tracks);
    } else {
      await createAlbumInMusicFolder(album.title, album.artist);
    }
  }
  return nextKey;
}

export async function editTracksMetadata(
  trackIds: number[],
  changes: { title?: string; artist?: string; albumTitle?: string; order?: number },
): Promise<void> {
  if (IN_NATIVE_SHELL) return askNative("editTracksMetadata", { trackIds, changes });
  await updateDownloadedTracks(trackIds, changes);
  const idSet = new Set(trackIds);
  const updated = (await getDownloadedTracks()).filter((t) => idSet.has(t.id));
  if (updated.length > 0) {
    await syncTracksInMusicFolder(updated);
  }
}

export async function moveTracksToTargetAlbum(
  trackIds: number[],
  target: { title: string; artist: string; artwork?: string },
): Promise<string> {
  if (IN_NATIVE_SHELL) return askNative<string>("moveTracksToAlbum", { trackIds, target });
  const nextKey = await moveTracksToAlbum(trackIds, target);
  const idSet = new Set(trackIds);
  const moved = (await getDownloadedTracks()).filter((t) => idSet.has(t.id));
  if (moved.length > 0) {
    await syncTracksInMusicFolder(moved);
  }
  return nextKey;
}
