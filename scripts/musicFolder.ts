import { useEffect, useState } from "react";
import { Directory, File, Paths } from "expo-file-system";
import { copyAsync } from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { readTags } from "./readTags";
import {
  CreatedAlbum,
  DownloadedTrack,
  albumTitleKey,
  cleanTrackTitle,
  getCreatedAlbums,
  getDownloadedTracks,
  replaceDownloadedLibrary,
} from "./downloadManager";
import {
  AUDIO_FILE,
  IMAGE_FILE,
  MUSIC_FOLDER_MANIFEST,
  MusicFolderManifest,
  albumFolderPath,
  buildMusicFolderManifest,
  folderAlbumAndArtist,
  isManifestFileName,
  parseMusicFolderManifest,
  pickCover,
  safeFileName,
  songDetails,
} from "./songFiles";

// The listener's chosen music folder on the phone (Android SAF / iOS directory picker).
// Its URI is kept in AsyncStorage so the app remembers it across visits. The app only indexes
// and plays what's in it; Rescan brings Downloads in line with the folder's audio files

export type MusicFolderStatus = "unsupported" | "none" | "needs-permission" | "ready";

const FOLDER_URI_KEY = "mirlo_blue_music_folder_uri";

let folderUri: string | null = null;
let status: MusicFolderStatus = "none";
const listeners = new Set<() => void>();

function setStatus(next: MusicFolderStatus) {
  status = next;
  listeners.forEach((listener) => listener());
}

function folderDisplayName(uri: string): string {
  const decoded = decodeURIComponent(uri).replace(/\/+$/, "");
  return decoded.split(/[/:]/).pop() || "Music";
}

export function useMusicFolder(): { status: MusicFolderStatus; name: string } {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { status, name: folderUri ? folderDisplayName(folderUri) : "" };
}

export async function openMusicFolder(): Promise<void> {
  const saved = await AsyncStorage.getItem(FOLDER_URI_KEY);
  if (!saved) {
    folderUri = null;
    return setStatus("none");
  }
  folderUri = saved;
  try {
    const dir = new Directory(saved);
    if (!dir.exists) return setStatus("needs-permission");
    setStatus("ready");
  } catch {
    setStatus("needs-permission");
  }
}

export async function chooseMusicFolder(): Promise<boolean> {
  let picked: Directory;
  try {
    picked = await Directory.pickDirectoryAsync(folderUri ?? undefined);
  } catch {
    return false;
  }
  folderUri = picked.uri;
  await AsyncStorage.setItem(FOLDER_URI_KEY, picked.uri);
  await rescanMusicFolder();
  setStatus("ready");
  return true;
}

export async function reconnectMusicFolder(): Promise<boolean> {
  return chooseMusicFolder();
}

function cleanEntryName(uri: string): string {
  const decoded = decodeURIComponent(uri).replace(/\/+$/, "");
  return decoded.split(/[/:]/).pop() || "file";
}

function coversFolder(): Directory {
  const folder = new Directory(Paths.document, "downloads", "covers");
  folder.create({ intermediates: true, idempotent: true });
  return folder;
}

// The folder's access grants don't let the tag reader open its files directly, so a song's
// tags are read from a short-lived copy in the cache
async function tagsOf(source: File, name: string, index: number) {
  const temp = new File(Paths.cache, `scan-${index}-${safeFileName(name)}`);
  await copyAsync({ from: source.uri, to: temp.uri });
  const handle = temp.open();
  try {
    return readTags((offset, length) => {
      handle.offset = offset;
      return handle.readBytes(length);
    }, source.size);
  } finally {
    handle.close();
    if (temp.exists) temp.delete();
  }
}

type FoundItem = {
  path: string;
  file: File;
  dirPath: string;
  dirName: string;
};

function scanTree(dir: Directory, prefix: string): { audio: FoundItem[]; images: FoundItem[] } {
  const audio: FoundItem[] = [];
  const images: FoundItem[] = [];
  const dirName = cleanEntryName(dir.uri);

  for (const entry of dir.list()) {
    const name = cleanEntryName(entry.uri);
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry instanceof Directory) {
      const sub = scanTree(entry, path);
      audio.push(...sub.audio);
      images.push(...sub.images);
    } else if (AUDIO_FILE.test(name)) {
      audio.push({ path, file: entry, dirPath: prefix, dirName });
    } else if (IMAGE_FILE.test(name)) {
      images.push({ path, file: entry, dirPath: prefix, dirName });
    }
  }
  return { audio, images };
}

// Brings Downloads in line with the folder and its nimue-library.json manifest: songs whose
// files are gone are forgotten, known songs load their organization from nimue-library.json,
// and new audio files are parsed into the universal schema and saved to nimue-library.json
export async function rescanMusicFolder(): Promise<void> {
  if (!folderUri) return;
  const root = new Directory(folderUri);
  if (!root.exists) {
    setStatus("needs-permission");
    return;
  }

  const [manifest, currentTracks, currentAlbums] = await Promise.all([
    readManifestFromRoot(root),
    getDownloadedTracks(),
    getCreatedAlbums(),
  ]);
  const { audio, images } = scanTree(root, "");

  const now = Date.now();
  const albumsByKey = new Map<string, CreatedAlbum>();
  for (const album of currentAlbums) {
    if (!album.key) continue;
    albumsByKey.set(album.key, { ...album });
  }
  if (manifest?.albums) {
    for (const [key, record] of Object.entries(manifest.albums)) {
      if (!key || !record) continue;
      const prev = albumsByKey.get(key);
      albumsByKey.set(key, {
        key,
        title: (record.title || prev?.title || "Imported Audio").trim(),
        artist: (record.artist || prev?.artist || "Unknown Artist").trim(),
        artwork: prev?.artwork || record.artwork,
        createdAt: record.createdAt || prev?.createdAt || now,
      });
    }
  }

  const coversByAlbum = new Map<string, string>();
  for (const [key, album] of albumsByKey.entries()) {
    if (album.artwork) coversByAlbum.set(key, album.artwork);
  }
  for (const track of currentTracks) {
    if (track.artwork && track.albumTitle) {
      const key = albumTitleKey(track.albumTitle);
      if (!coversByAlbum.has(key)) coversByAlbum.set(key, track.artwork);
    }
  }

  const existingByPath = new Map<string, DownloadedTrack>();
  for (const track of currentTracks) {
    if (track.path) existingByPath.set(track.path, track);
  }

  const nextTracks: DownloadedTrack[] = [];

  for (const [index, item] of audio.entries()) {
    const existing = existingByPath.get(item.path);
    const manifestTrack = manifest?.tracks?.[item.path];
    const manifestAlbum = manifestTrack ? albumsByKey.get(manifestTrack.albumKey) : undefined;
    const knownDuration = manifestTrack?.duration || existing?.duration;
    const knownAlbumKey =
      manifestTrack?.albumKey ||
      (manifestAlbum ? manifestAlbum.key : undefined);

    if (
      manifestTrack &&
      knownDuration &&
      knownDuration > 0 &&
      knownAlbumKey &&
      (coversByAlbum.has(knownAlbumKey) || existing?.artwork)
    ) {
      const albumTitle = (manifestAlbum?.title || existing?.albumTitle || "Imported Audio").trim();
      const artist = (manifestAlbum?.artist || existing?.artist || "Unknown Artist").trim();
      const artwork = coversByAlbum.get(knownAlbumKey) || existing?.artwork;
      nextTracks.push({
        id: manifestTrack.id || existing?.id || -(now + index),
        title: cleanTrackTitle(manifestTrack.title) || manifestTrack.title || "Song",
        artist,
        albumTitle,
        order: manifestTrack.order ?? existing?.order ?? index + 1,
        duration: knownDuration,
        artwork,
        url: item.file.uri,
        path: item.path,
        bytes: item.file.size,
        downloadedAt: existing?.downloadedAt || now,
        source: existing?.source || "file",
      });
      continue;
    }

    const name = cleanEntryName(item.file.uri);
    const tags = await tagsOf(item.file, name, index);
    const folderMeta = folderAlbumAndArtist(item.dirPath);
    const details = songDetails(
      tags,
      name,
      index,
      folderMeta.album || undefined,
      folderMeta.artist || undefined,
    );

    const existingAlbumKey = existing?.albumTitle ? albumTitleKey(existing.albumTitle) : undefined;
    const existingUserAlbum =
      existingAlbumKey &&
      existingAlbumKey !== albumTitleKey("Imported Audio") &&
      existingAlbumKey !== albumTitleKey("Music")
        ? albumsByKey.get(existingAlbumKey)
        : undefined;

    const resolvedAlbumTitle = (
      manifestAlbum?.title ||
      existingUserAlbum?.title ||
      details.albumTitle ||
      "Imported Audio"
    ).trim();
    const albumKey = albumTitleKey(resolvedAlbumTitle);
    const knownAlbum = albumsByKey.get(albumKey);
    const resolvedArtist = (
      manifestAlbum?.artist ||
      knownAlbum?.artist ||
      existingUserAlbum?.artist ||
      details.artist ||
      "Unknown Artist"
    ).trim();
    const resolvedTitle =
      cleanTrackTitle(manifestTrack?.title) ||
      (existingUserAlbum ? cleanTrackTitle(existing?.title) : "") ||
      details.title ||
      "Song";
    const resolvedOrder =
      manifestTrack?.order ??
      (existingUserAlbum ? existing?.order : undefined) ??
      details.order;
    const resolvedDuration =
      manifestTrack?.duration || details.duration || existing?.duration;

    if (!coversByAlbum.has(albumKey)) {
      if (tags.cover) {
        const ext = tags.cover.mime.includes("png") ? "png" : "jpg";
        const cover = new File(coversFolder(), `${now}-${index}.${ext}`);
        cover.write(tags.cover.bytes);
        coversByAlbum.set(albumKey, cover.uri);
      } else {
        const dirImages = images.filter((img) => img.dirPath === item.dirPath);
        const picked = pickCover(dirImages.map((img) => img.path));
        const image = dirImages.find((img) => img.path === picked);
        if (image) coversByAlbum.set(albumKey, image.file.uri);
      }
    }

    const artwork = coversByAlbum.get(albumKey) || existing?.artwork;
    if (!albumsByKey.has(albumKey)) {
      albumsByKey.set(albumKey, {
        key: albumKey,
        title: resolvedAlbumTitle,
        artist: resolvedArtist,
        artwork,
        createdAt: now,
      });
    } else if (artwork && !albumsByKey.get(albumKey)!.artwork) {
      albumsByKey.get(albumKey)!.artwork = artwork;
    }

    nextTracks.push({
      id: manifestTrack?.id || existing?.id || -(now + index),
      title: resolvedTitle,
      artist: resolvedArtist,
      albumTitle: resolvedAlbumTitle,
      order: resolvedOrder,
      ...(resolvedDuration !== undefined ? { duration: resolvedDuration } : {}),
      artwork,
      url: item.file.uri,
      path: item.path,
      bytes: item.file.size,
      downloadedAt: existing?.downloadedAt || now,
      source: existing?.source || "file",
    });
  }

  await replaceDownloadedLibrary(nextTracks, Array.from(albumsByKey.values()));
  await syncMusicFolderManifest();
}

async function getReadyRoot(): Promise<Directory | null> {
  if (!folderUri) {
    folderUri = await AsyncStorage.getItem(FOLDER_URI_KEY);
  }
  if (!folderUri) return null;
  try {
    const root = new Directory(folderUri);
    return root.exists ? root : null;
  } catch {
    return null;
  }
}

function findSubdirectory(parent: Directory, name: string): Directory | undefined {
  const target = name.toLowerCase();
  for (const entry of parent.list()) {
    if (entry instanceof Directory && cleanEntryName(entry.uri).toLowerCase() === target) {
      return entry;
    }
  }
  return undefined;
}

function findFileInDirectory(parent: Directory, name: string): File | undefined {
  const target = name.toLowerCase();
  for (const entry of parent.list()) {
    if (entry instanceof File && cleanEntryName(entry.uri).toLowerCase() === target) {
      return entry;
    }
  }
  return undefined;
}

function findManifestFileInDirectory(parent: Directory): File | undefined {
  for (const entry of parent.list()) {
    if (entry instanceof File && isManifestFileName(cleanEntryName(entry.uri))) {
      return entry;
    }
  }
  return undefined;
}

async function readManifestFromRoot(root: Directory): Promise<MusicFolderManifest | null> {
  const file = findManifestFileInDirectory(root);
  if (!file || !file.exists) return null;
  try {
    const text = await file.text();
    const parsed = parseMusicFolderManifest(text);
    if (parsed) return parsed;
  } catch {}
  try {
    const temp = new File(Paths.cache, `manifest-${Date.now()}.json`);
    await copyAsync({ from: file.uri, to: temp.uri });
    try {
      const text = await temp.text();
      return parseMusicFolderManifest(text);
    } finally {
      if (temp.exists) temp.delete();
    }
  } catch {
    return null;
  }
}

async function writeManifestToRoot(
  root: Directory,
  manifest: MusicFolderManifest,
): Promise<void> {
  const json = JSON.stringify(manifest, null, 2);
  const existing = findManifestFileInDirectory(root);
  if (existing && existing.exists) {
    try {
      const prevSize = Number(existing.size || 0);
      const padded =
        prevSize > json.length ? json + " ".repeat(prevSize - json.length) : json;
      existing.write(padded);
      return;
    } catch {
      try {
        existing.delete();
      } catch {}
    }
  }
  const created = root.createFile(MUSIC_FOLDER_MANIFEST, "application/json");
  created.write(json);
}

export async function syncMusicFolderManifest(): Promise<void> {
  const root = await getReadyRoot();
  if (!root) return;
  try {
    const [tracks, albums] = await Promise.all([
      getDownloadedTracks(),
      getCreatedAlbums(),
    ]);
    const manifest = buildMusicFolderManifest(tracks, albums);
    await writeManifestToRoot(root, manifest);
  } catch (err) {
    console.warn("Failed to sync nimue-library.json in music folder:", err);
  }
}

function findFileInRoot(root: Directory, relativePath?: string): File | undefined {
  if (!relativePath) return undefined;
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length === 0) return undefined;
  let current = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = findSubdirectory(current, parts[i]);
    if (!next) return undefined;
    current = next;
  }
  return findFileInDirectory(current, parts[parts.length - 1]);
}

function pruneEmptyDirsInRoot(root: Directory, dirs: string[]): void {
  const cleanDirs = dirs.map((d) => d.trim()).filter(Boolean);
  for (let depth = cleanDirs.length; depth > 0; depth--) {
    let parent = root;
    let found = true;
    for (let i = 0; i < depth - 1; i++) {
      const next = findSubdirectory(parent, cleanDirs[i]);
      if (!next) {
        found = false;
        break;
      }
      parent = next;
    }
    if (!found) continue;
    const target = findSubdirectory(parent, cleanDirs[depth - 1]);
    if (!target) continue;
    try {
      if (target.list().length === 0) {
        target.delete();
      } else {
        break;
      }
    } catch {
      break;
    }
  }
}

export async function createAlbumInMusicFolder(_title: string, _artist: string): Promise<void> {
  await syncMusicFolderManifest();
}

export async function syncTracksInMusicFolder(_tracks?: DownloadedTrack[]): Promise<void> {
  await syncMusicFolderManifest();
}

export async function deleteTracksFromMusicFolder(
  tracks: DownloadedTrack[],
  albumInfo?: { title: string; artist: string },
): Promise<void> {
  const root = await getReadyRoot();
  for (const track of tracks) {
    let deleted = false;
    if (root && track.path) {
      try {
        const found = findFileInRoot(root, track.path);
        if (found && found.exists) {
          found.delete();
          deleted = true;
        }
        const oldDirs = track.path.split("/").slice(0, -1);
        if (oldDirs.length > 0) pruneEmptyDirsInRoot(root, oldDirs);
      } catch {}
    }
    if (!deleted && track.url) {
      try {
        const direct = new File(track.url);
        if (direct.exists) direct.delete();
      } catch {}
    }
  }
  if (root && albumInfo?.title) {
    try {
      const dirPath = albumFolderPath(albumInfo.artist, albumInfo.title);
      pruneEmptyDirsInRoot(root, dirPath.split("/"));
    } catch {}
  }
}
