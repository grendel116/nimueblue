import {
  DownloadedAlbum,
  DownloadedTrack,
  forgetDownloadedTracks,
  getDownloadedTracks,
} from "./downloadManager";
import { IMAGE_FILE } from "./songFiles";
import { removeFile } from "./musicFolder.web";
import { IN_NATIVE_SHELL, askNative } from "./nativeShell";

// The browser adds your own music through the music folder, so picking album covers stays
// with the phone, which the Android app reaches through its shell
export const PICKS_PHONE_FILES = IN_NATIVE_SHELL;

// Downloads unpack directly into the listener's music folder on Chromium browsers; the
// Android app hands them to the phone's browser instead
export const CAN_DOWNLOAD =
  IN_NATIVE_SHELL || (typeof window !== "undefined" && "showDirectoryPicker" in window);

// Deletes saved songs from the music folder, then the covers no saved song uses any more
export async function removeDownloads(tracks: DownloadedTrack[]): Promise<void> {
  if (IN_NATIVE_SHELL) return askNative("removeDownloads", { ids: tracks.map((t) => t.id) });
  for (const t of tracks) if (t.path) await removeFile(t.path);
  await forgetDownloadedTracks(tracks.map((t) => t.id));

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
