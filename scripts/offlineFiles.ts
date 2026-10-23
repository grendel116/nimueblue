import { Directory, File, Paths } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
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
import {
  createAlbumInMusicFolder,
  deleteTracksFromMusicFolder,
  syncTracksInMusicFolder,
} from "./musicFolder";

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
  albumKey?: string,
): Promise<void> {
  const existingAlbum = albumKey
    ? groupTracksIntoAlbums(await getDownloadedTracks()).find((a) => a.key === albumKey)
    : undefined;
  await deleteTracksFromMusicFolder(
    tracks,
    existingAlbum ? { title: existingAlbum.title, artist: existingAlbum.artist } : undefined,
  );
  if (tracks.length > 0) await forgetDownloadedTracks(tracks.map((t) => t.id));
  if (albumKey) await removeCreatedAlbum(albumKey);
  await syncTracksInMusicFolder();
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
  await syncTracksInMusicFolder();
  await pruneCovers();
}

export async function createAlbumFolder(title: string, artist: string): Promise<string> {
  const key = await createDownloadedAlbum(title, artist);
  await createAlbumInMusicFolder(title, artist);
  return key;
}

export async function editAlbumMetadata(
  albumKey: string,
  changes: { albumTitle?: string; artist?: string },
  extraTrackIds?: number[],
): Promise<string> {
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
  const nextKey = await moveTracksToAlbum(trackIds, target);
  const idSet = new Set(trackIds);
  const moved = (await getDownloadedTracks()).filter((t) => idSet.has(t.id));
  if (moved.length > 0) {
    await syncTracksInMusicFolder(moved);
  }
  return nextKey;
}
