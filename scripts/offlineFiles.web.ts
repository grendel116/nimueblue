import { unzip, type Unzipped } from "fflate";
import { API_ROOT } from "@/constants/api-root";
import { mirloHeaders } from "@/queries/fetch/fetchWrapper";
import {
  DownloadedAlbum,
  DownloadedTrack,
  DownloadFormat,
  DownloadStage,
  forgetDownloadedTracks,
  getDownloadedTracks,
  saveDownloadedTracks,
} from "./downloadManager";
import { MirloSource, mirloZipUrl } from "./mirloZip";
import { readTags } from "./readTags";
import { flacHeaderWithCover } from "./flacCover";
import {
  albumFolderPath,
  AUDIO_FILE,
  bytesReader,
  fetchCoverJpeg,
  IMAGE_FILE,
  matchTrack,
  MirloTrack,
  namesFromFile,
  songFileName,
} from "./songFiles";
import { linkFiles, readyMusicFolder, removeFile, writeFile } from "./musicFolder.web";
import { IN_NATIVE_SHELL, askNative } from "./nativeShell";

// The browser adds your own music through the music folder, so picking album covers stays
// with the phone, which the Android app reaches through its shell
export const PICKS_PHONE_FILES = IN_NATIVE_SHELL;

// Downloads unpack directly into the listener's music folder on Chromium browsers; the
// Android app hands them to the phone's browser instead
export const CAN_DOWNLOAD =
  IN_NATIVE_SHELL || (typeof window !== "undefined" && "showDirectoryPicker" in window);

// In the Android app Mirlo's zip goes to the phone's browser, which saves it to Downloads,
// as the phone build does
async function sendZipToPhone(
  source: MirloSource,
  id: number,
  format: DownloadFormat,
  onStage: (stage: DownloadStage) => void,
): Promise<void> {
  onStage("preparing");
  const url = await mirloZipUrl(source, id, format);
  // Mirlo's own address needs the listener's login headers, which the browser can't send
  if (url.startsWith(API_ROOT)) throw new Error("Mirlo didn't give a download link for this one");
  onStage("downloading");
  window.open(url, "_blank");
}

function unzipped(zip: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => unzip(zip, (err, files) => (err ? reject(err) : resolve(files))));
}

// Writes the cover into a FLAC file; other files, and FLACs that have one, stay as they are
function withFlacCover(bytes: Uint8Array, jpeg: Uint8Array): Uint8Array {
  const rebuilt = flacHeaderWithCover(bytesReader(bytes), jpeg);
  if (!rebuilt) return bytes;
  const audio = bytes.subarray(rebuilt.audioStart);
  const out = new Uint8Array(rebuilt.header.length + audio.length);
  out.set(rebuilt.header);
  out.set(audio, rebuilt.header.length);
  return out;
}

// Downloads a Mirlo zip into "<music folder>/<Artist>/<Album>/" with the album's cover, and saves
// its songs under their Mirlo ids. `pick` ties each unpacked song to its Mirlo track, and
// `replaces` picks out earlier downloads this one supersedes
async function downloadIntoFolder(
  source: MirloSource,
  id: number,
  album: AlbumProps,
  format: DownloadFormat,
  onStage: (stage: DownloadStage) => void,
  pick: (fileName: string, bytes: Uint8Array) => MirloTrack | undefined,
  replaces: (t: DownloadedTrack, folder: string) => boolean,
): Promise<number> {
  await readyMusicFolder();
  onStage("preparing");
  const url = await mirloZipUrl(source, id, format);

  onStage("downloading");
  const response = await fetch(url, url.startsWith(API_ROOT) ? { headers: await mirloHeaders() } : undefined);
  if (!response.ok) throw new Error(`Mirlo's download stopped (${response.status})`);
  const files = await unzipped(new Uint8Array(await response.arrayBuffer()));

  onStage("unpacking");
  const names = Object.keys(files).filter((n) => !n.endsWith("/"));
  const audio = names.filter((n) => AUDIO_FILE.test(n));
  if (audio.length === 0) throw new Error("Mirlo didn't send any songs");
  const folder = albumFolderPath(album.artist?.name, album.title);

  const jpeg = await fetchCoverJpeg(album);
  const zipImage = names.find((n) => IMAGE_FILE.test(n));
  const coverPath = jpeg
    ? `${folder}/cover.jpg`
    : zipImage && `${folder}/cover.${zipImage.split(".").pop()!.toLowerCase()}`;
  if (coverPath) await writeFile(coverPath, jpeg ?? files[zipImage!]);

  const now = Date.now();
  const songs = audio.map((name, i) => {
    const fileName = name.split("/").pop()!;
    const track = pick(fileName, files[name]);
    return { fileName, bytes: files[name], track, id: track?.id ?? -(now + i) };
  });

  const ids = new Set(songs.map((s) => s.id));
  const replaced = (await getDownloadedTracks()).filter((t) => ids.has(t.id) || replaces(t, folder));
  for (const t of replaced) if (t.path) await removeFile(t.path);
  await forgetDownloadedTracks(replaced.map((t) => t.id));

  const artist = album.artist?.name ?? "";
  const saved: DownloadedTrack[] = [];
  for (const { fileName, bytes, track, id: songId } of songs) {
    const ready = jpeg ? withFlacCover(bytes, jpeg) : bytes;
    const title = track?.title ?? namesFromFile(fileName).title;
    const path = `${folder}/${songFileName(track?.order, title, fileName.split(".").pop()!.toLowerCase())}`;
    await writeFile(path, ready);
    saved.push({
      id: songId,
      title,
      artist,
      albumTitle: album.title,
      url: "",
      path,
      coverPath,
      folder,
      duration: track?.audio?.duration,
      bytes: ready.length,
      order: track?.order,
      downloadedAt: Date.now(),
      source: "mirlo",
    });
  }
  await saveDownloadedTracks(saved);
  await linkFiles();
  return saved.length;
}

// Downloads an album you own from Mirlo into the music folder, replacing any earlier download
export async function downloadAlbum(
  album: AlbumProps,
  format: DownloadFormat,
  onStage: (stage: DownloadStage) => void,
): Promise<void> {
  if (IN_NATIVE_SHELL) return sendZipToPhone("trackGroups", album.id, format, onStage);
  const tracks = album.tracks ?? [];
  await downloadIntoFolder(
    "trackGroups",
    album.id,
    album,
    format,
    onStage,
    (fileName, bytes) => matchTrack(readTags(bytesReader(bytes)), fileName, tracks),
    (t, folder) => t.folder === folder,
  );
}

// Downloads one song of an album you own into the music folder
export async function downloadTrack(
  album: AlbumProps,
  track: MirloTrack,
  format: DownloadFormat,
  onStage: (stage: DownloadStage) => void,
): Promise<void> {
  if (IN_NATIVE_SHELL) return sendZipToPhone("tracks", track.id, format, onStage);
  await downloadIntoFolder("tracks", track.id, album, format, onStage, () => track, () => false);
}

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
