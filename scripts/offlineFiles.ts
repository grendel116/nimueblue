import { Directory, File, Paths } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import {
  DownloadedAlbum,
  DownloadedTrack,
  forgetDownloadedTracks,
  getDownloadedTracks,
  updateAlbum,
} from "./downloadManager";

// Saving files to the phone. The web build uses offlineFiles.web.ts instead.
// The phone picks its own album covers; its songs come from the music folder
export const PICKS_PHONE_FILES = true;
export const CAN_DOWNLOAD = true;

function downloadsFolder(name: string): Directory {
  const folder = new Directory(Paths.document, "downloads", name);
  folder.create({ intermediates: true, idempotent: true });
  return folder;
}

// Moves a file the picker handed us into app storage, so no copy is left in the cache
function adopt(pickedUri: string, destination: File): void {
  const source = new File(pickedUri);
  source.copy(destination);
  try {
    source.delete();
  } catch {}
}

function deleteQuietly(uri: string): void {
  try {
    const entry = new File(uri);
    if (entry.exists) entry.delete();
  } catch {}
}

// Covers you picked live in one folder; remove the ones no saved song uses any more
async function pruneCovers(): Promise<void> {
  const covers = new Directory(Paths.document, "downloads", "covers");
  if (!covers.exists) return;
  const nameOf = (uri: string) => uri.split("/").pop();
  const inUse = new Set(
    (await getDownloadedTracks()).map((t) => t.artwork && nameOf(t.artwork)),
  );
  for (const entry of covers.list()) {
    if (entry instanceof File && !inUse.has(nameOf(entry.uri)))
      deleteQuietly(entry.uri);
  }
}

// Deletes saved songs from the music folder, then the covers nothing uses any more
export async function removeDownloads(
  tracks: DownloadedTrack[],
): Promise<void> {
  tracks.forEach((t) => deleteQuietly(t.url));
  await forgetDownloadedTracks(tracks.map((t) => t.id));
  await pruneCovers();
}

// Lets you pick an image from the phone as an album's cover
export async function chooseAlbumCover(album: DownloadedAlbum): Promise<void> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: "image/*",
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.[0]) return;

  const asset = picked.assets[0];
  const extension = asset.name.split(".").pop() || "jpg";
  const cover = new File(
    downloadsFolder("covers"),
    `${Date.now()}.${extension}`,
  );
  adopt(asset.uri, cover);
  await updateAlbum(album.key, { artwork: cover.uri });
  await pruneCovers();
}
