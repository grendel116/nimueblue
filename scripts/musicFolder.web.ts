import { useEffect, useState } from "react";
import { readTags } from "./readTags";
import {
  DownloadedTrack,
  FolderLinks,
  forgetDownloadedTracks,
  getDownloadedTracks,
  saveDownloadedTracks,
  setFolderLinks,
  showDownloads,
} from "./downloadManager";
import { IN_NATIVE_SHELL, askNative, onNative } from "./nativeShell";
import {
  AUDIO_FILE,
  IMAGE_FILE,
  bytesReader,
  folderChanges,
  namesFromFile,
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
onNative("downloads", (data) => showDownloads(data.tracks ?? []));

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

// The open folder, asking for one first when needed. Downloads call this before anything else
// so the tap that started them still counts as the gesture the browser asks for
export async function readyMusicFolder(): Promise<FileSystemDirectoryHandle> {
  const ready = status === "ready" || (status === "needs-permission" ? await reconnectMusicFolder() : await chooseMusicFolder());
  if (!ready || !folder) throw new Error("Choose a music folder to download into");
  return folder;
}

async function directoryAt(path: string[], create = false): Promise<FileSystemDirectoryHandle> {
  let dir = folder!;
  for (const name of path) dir = await dir.getDirectoryHandle(name, { create });
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

export async function writeFile(path: string, bytes: Uint8Array): Promise<void> {
  const { dirs, name } = split(path);
  const handle = await (await directoryAt(dirs, true)).getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(bytes as unknown as BufferSource);
  await writable.close();
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
  return readTags(bytesReader(new Uint8Array(await file.slice(0, TAG_BYTES).arrayBuffer())));
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
  for (const track of await getDownloadedTracks()) {
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

// Brings Downloads in line with the folder: songs whose files are gone are forgotten, and audio
// files not saved yet join as your own songs, described by their tags, names and folders
export async function rescanMusicFolder(): Promise<void> {
  if (IN_NATIVE_SHELL) return askNative("rescanMusicFolder");
  if (!folder) return;
  const files = await filesUnder(folder, "");
  const audio = files.filter((f) => AUDIO_FILE.test(f.path));
  const images = files.filter((f) => IMAGE_FILE.test(f.path)).map((f) => f.path);
  const { gone, added } = folderChanges(await getDownloadedTracks(), audio.map((f) => f.path));
  await forgetDownloadedTracks(gone);

  const now = Date.now();
  const saved: DownloadedTrack[] = [];
  for (const [index, path] of added.entries()) {
    const file = await audio.find((f) => f.path === path)!.handle.getFile();
    const tags = await tagsOf(file);
    const { dirs, name } = split(path);
    const parent = namesFromFile(dirs[dirs.length - 1] ?? "");
    const folderCover = pickCover(images.filter((p) => split(p).dirs.join("/") === dirs.join("/")));
    saved.push({
      id: -(now + index),
      ...songDetails(tags, name, index, parent.title || undefined, parent.artist || undefined),
      url: "",
      path,
      coverPath: tags.cover ? path : folderCover,
      bytes: file.size,
      downloadedAt: now,
      source: "file",
    });
  }
  if (saved.length) await saveDownloadedTracks(saved);
  await linkFiles();
}
