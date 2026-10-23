import { useEffect, useState } from "react";
import { readTags } from "./readTags";
import {
  CreatedAlbum,
  DownloadedTrack,
  FolderLinks,
  albumTitleKey,
  cleanTrackTitle,
  getCreatedAlbums,
  getDownloadedTracks,
  replaceDownloadedLibrary,
  setFolderLinks,
  showDownloads,
  updateDownloadedTracks,
} from "./downloadManager";
import { IN_NATIVE_SHELL, askNative, onNative } from "./nativeShell";
import {
  AUDIO_FILE,
  IMAGE_FILE,
  MUSIC_FOLDER_MANIFEST,
  MusicFolderManifest,
  buildMusicFolderManifest,
  folderAlbumAndArtist,
  parseMusicFolderManifest,
  pickCover,
  songDetails,
} from "./songFiles";

// The listener's music folder on their computer (File System Access API, Chromium desktop).
// It is the web app's offline library: Mirlo downloads unpack into it, and the songs already in
// it show in Downloads. The folder's handle is kept in IndexedDB so it reopens on the next visit

export type MusicFolderStatus = "unsupported" | "none" | "needs-permission" | "ready";

const SUPPORTED = (typeof window !== "undefined" && "showDirectoryPicker" in window) || IN_NATIVE_SHELL;
const DB_NAME = "nimueblue";
const STORE = "handles";
const HANDLE_KEY = "musicFolder";
// Tags sit at the start of a song; reading this much covers them without loading whole albums
const TAG_BYTES = 4 * 1024 * 1024;
const TAIL_BYTES = 65536;

let folder: FileSystemDirectoryHandle | null = null;
// In the Android app the phone holds the folder and sends its name
let shellFolderName = "";
let status: MusicFolderStatus = SUPPORTED ? "none" : "unsupported";
const listeners = new Set<() => void>();
const links: FolderLinks = { audio: new Map(), covers: new Map() };

function setStatus(next: MusicFolderStatus) {
  status = next;
  listeners.forEach((listener) => listener());
}

onNative("musicFolder", (data) => {
  shellFolderName = data.name ?? "";
  setStatus(data.status);
});
onNative("downloads", (data) => showDownloads(data.tracks ?? [], data.createdAlbums));

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// The folder's status and name, kept current
export function useMusicFolder(): { status: MusicFolderStatus; name: string } {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { status, name: IN_NATIVE_SHELL ? shellFolderName : (folder?.name ?? "") };
}

// Reopens the folder chosen on an earlier visit. The browser keeps permission for some
// sessions; otherwise the listener reconnects with a tap. In the Android app the phone
// reopens it and sends the news
export async function openMusicFolder(): Promise<void> {
  if (IN_NATIVE_SHELL || !SUPPORTED) return;
  folder = (await storeRequest<FileSystemDirectoryHandle | undefined>("readonly", (s) => s.get(HANDLE_KEY))) ?? null;
  if (!folder) return setStatus("none");
  if ((await folder.queryPermission({ mode: "readwrite" })) !== "granted") return setStatus("needs-permission");
  await linkFiles();
  setStatus("ready");
}

// Asks for a folder and scans it. Call it straight from a tap: the browser shows its picker
// only for a fresh user gesture
export async function chooseMusicFolder(): Promise<boolean> {
  if (IN_NATIVE_SHELL) return askNative<boolean>("pickMusicFolder");
  let picked: FileSystemDirectoryHandle;
  try {
    picked = await window.showDirectoryPicker({ id: "mirlo-music", mode: "readwrite", startIn: "music" });
  } catch {
    return false; // the listener closed the picker
  }
  folder = picked;
  await storeRequest("readwrite", (s) => s.put(picked, HANDLE_KEY));
  links.audio.clear();
  links.covers.clear();
  await rescanMusicFolder();
  setStatus("ready");
  return true;
}

// Asks the browser to let the app back into the folder; also needs a fresh tap
export async function reconnectMusicFolder(): Promise<boolean> {
  if (IN_NATIVE_SHELL || !folder) return chooseMusicFolder();
  if ((await folder.requestPermission({ mode: "readwrite" })) !== "granted") return false;
  await linkFiles();
  setStatus("ready");
  return true;
}

async function directoryAt(path: string[]): Promise<FileSystemDirectoryHandle> {
  let dir = folder!;
  for (const name of path) dir = await dir.getDirectoryHandle(name);
  return dir;
}

function split(path: string): { dirs: string[]; name: string } {
  const parts = path.split("/");
  return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] };
}

export async function readFile(path: string): Promise<File> {
  const { dirs, name } = split(path);
  return (await (await directoryAt(dirs)).getFileHandle(name)).getFile();
}

// Deletes a file, then each folder above it that it leaves empty
export async function removeFile(path: string): Promise<void> {
  const { dirs, name } = split(path);
  try {
    await (await directoryAt(dirs)).removeEntry(name);
  } catch {
    return; // already gone
  }
  for (let depth = dirs.length; depth > 0; depth--) {
    const parent = await directoryAt(dirs.slice(0, depth - 1));
    const dir = await parent.getDirectoryHandle(dirs[depth - 1]);
    for await (const _ of dir.values()) return;
    await parent.removeEntry(dirs[depth - 1]);
  }
}

async function tagsOf(file: Blob) {
  const head = new Uint8Array(await file.slice(0, TAG_BYTES).arrayBuffer());
  const tailStart = file.size > TAG_BYTES ? Math.max(TAG_BYTES, file.size - TAIL_BYTES) : file.size;
  const tail =
    file.size > TAG_BYTES ? new Uint8Array(await file.slice(tailStart, file.size).arrayBuffer()) : new Uint8Array(0);
  return readTags((offset, length) => {
    if (offset < head.length) return head.subarray(offset, offset + length);
    if (offset >= tailStart && offset < file.size) {
      const rel = offset - tailStart;
      return tail.subarray(rel, rel + length);
    }
    return new Uint8Array(0);
  }, file.size);
}

function probeBrowserDuration(url: string): Promise<number | undefined> {
  if (typeof Audio === "undefined" || !url) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    const done = (val?: number) => {
      audio.removeAttribute("src");
      resolve(val && Number.isFinite(val) && val > 0 ? Math.round(val) : undefined);
    };
    const timer = setTimeout(() => done(undefined), 3000);
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      done(audio.duration);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      done(undefined);
    };
    audio.src = url;
  });
}

async function coverLink(coverPath: string): Promise<string | undefined> {
  const file = await readFile(coverPath);
  if (IMAGE_FILE.test(coverPath)) return URL.createObjectURL(file);
  const cover = (await tagsOf(file)).cover;
  return cover && URL.createObjectURL(new Blob([cover.bytes as unknown as BlobPart], { type: cover.mime }));
}

// Makes browser links for every saved song and cover not linked yet. Songs whose files are
// gone stay unlinked until a rescan forgets them
export async function linkFiles(): Promise<void> {
  const tracks = await getDownloadedTracks();
  for (const track of tracks) {
    try {
      if (track.path && !links.audio.has(track.path))
        links.audio.set(track.path, URL.createObjectURL(await readFile(track.path)));
      if (track.coverPath && !links.covers.has(track.coverPath)) {
        const link = await coverLink(track.coverPath);
        if (link) links.covers.set(track.coverPath, link);
      }
    } catch (err) {
      console.warn(`Couldn't open ${track.path}:`, err);
    }
  }
  await setFolderLinks({ audio: new Map(links.audio), covers: new Map(links.covers) });

  // Fill in missing durations for tracks whose files are now linked
  for (const track of await getDownloadedTracks()) {
    if ((!track.duration || track.duration <= 0) && track.url) {
      const dur = await probeBrowserDuration(track.url);
      if (dur) await updateDownloadedTracks([track.id], { duration: dur });
    }
  }
}

type FoundFile = { path: string; handle: FileSystemFileHandle };

// Every file under a folder, with its path from the music folder
async function filesUnder(dir: FileSystemDirectoryHandle, prefix: string): Promise<FoundFile[]> {
  const found: FoundFile[] = [];
  for await (const entry of dir.values()) {
    const path = prefix + entry.name;
    if (entry.kind === "directory") found.push(...(await filesUnder(entry as FileSystemDirectoryHandle, `${path}/`)));
    else found.push({ path, handle: entry as FileSystemFileHandle });
  }
  return found;
}

async function readManifestFromWebRoot(): Promise<MusicFolderManifest | null> {
  if (!folder) return null;
  try {
    const handle = await folder.getFileHandle(MUSIC_FOLDER_MANIFEST);
    const file = await handle.getFile();
    return parseMusicFolderManifest(await file.text());
  } catch {
    return null;
  }
}

async function writeManifestToWebRoot(manifest: MusicFolderManifest): Promise<void> {
  if (!folder) return;
  const handle = await folder.getFileHandle(MUSIC_FOLDER_MANIFEST, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(manifest, null, 2));
  await writable.close();
}

export async function syncMusicFolderManifest(): Promise<void> {
  if (IN_NATIVE_SHELL || !folder) return;
  try {
    const [tracks, albums] = await Promise.all([
      getDownloadedTracks(),
      getCreatedAlbums(),
    ]);
    await writeManifestToWebRoot(buildMusicFolderManifest(tracks, albums));
  } catch (err) {
    console.warn("Failed to sync nimue-library.json in web music folder:", err);
  }
}

// Brings Downloads in line with the folder and its nimue-library.json manifest
export async function rescanMusicFolder(): Promise<void> {
  if (IN_NATIVE_SHELL) return askNative("rescanMusicFolder");
  if (!folder) return;
  const [manifest, files, currentTracks, currentAlbums] = await Promise.all([
    readManifestFromWebRoot(),
    filesUnder(folder, ""),
    getDownloadedTracks(),
    getCreatedAlbums(),
  ]);
  const audio = files.filter((f) => AUDIO_FILE.test(f.path));
  const images = files.filter((f) => IMAGE_FILE.test(f.path)).map((f) => f.path);

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

    if (manifestTrack && knownDuration && knownDuration > 0 && existing?.coverPath) {
      const albumTitle = (manifestAlbum?.title || existing?.albumTitle || "Imported Audio").trim();
      const artist = (manifestAlbum?.artist || existing?.artist || "Unknown Artist").trim();
      nextTracks.push({
        id: manifestTrack.id || existing?.id || -(now + index),
        title: cleanTrackTitle(manifestTrack.title) || manifestTrack.title || "Song",
        artist,
        albumTitle,
        order: manifestTrack.order ?? existing?.order ?? index + 1,
        duration: knownDuration,
        url: "",
        path: item.path,
        coverPath: existing.coverPath,
        bytes: existing.bytes,
        downloadedAt: existing.downloadedAt || now,
        source: existing.source || "file",
      });
      continue;
    }

    const file = await item.handle.getFile();
    const tags = await tagsOf(file);
    const { dirs, name } = split(item.path);
    const dirPath = dirs.join("/");
    const folderMeta = folderAlbumAndArtist(dirPath);
    const details = songDetails(
      tags,
      name,
      index,
      folderMeta.album || undefined,
      folderMeta.artist || undefined,
    );
    const folderCover = pickCover(images.filter((p) => split(p).dirs.join("/") === dirPath));

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

    if (!albumsByKey.has(albumKey)) {
      albumsByKey.set(albumKey, {
        key: albumKey,
        title: resolvedAlbumTitle,
        artist: resolvedArtist,
        createdAt: now,
      });
    }

    nextTracks.push({
      id: manifestTrack?.id || existing?.id || -(now + index),
      title: resolvedTitle,
      artist: resolvedArtist,
      albumTitle: resolvedAlbumTitle,
      order: resolvedOrder,
      ...(resolvedDuration !== undefined ? { duration: resolvedDuration } : {}),
      url: "",
      path: item.path,
      coverPath: tags.cover ? item.path : folderCover,
      bytes: file.size,
      downloadedAt: existing?.downloadedAt || now,
      source: existing?.source || "file",
    });
  }

  await replaceDownloadedLibrary(nextTracks, Array.from(albumsByKey.values()));
  await syncMusicFolderManifest();
  await linkFiles();
}

export async function createAlbumInMusicFolder(_title: string, _artist: string): Promise<void> {
  await syncMusicFolderManifest();
}

export async function syncTracksInMusicFolder(_tracks?: DownloadedTrack[]): Promise<void> {
  await syncMusicFolderManifest();
}
