import type { ByteReader, Tags } from "./readTags";

// Naming, matching and describing saved song files; shared by the phone and web builds

export const AUDIO_FILE = /\.(mp3|flac|m4a|opus|ogg|wav|aac)$/i;
export const IMAGE_FILE = /\.(jpe?g|png|webp)$/i;

// The parts of a Mirlo track we save
export type MirloTrack = {
  id: number;
  title: string;
  order?: number;
  audio?: { duration?: number };
};

export function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

// A file or folder name every desktop system accepts: safe characters, no trailing dots or spaces
export function safeSegment(name: string, empty: string): string {
  return safeFileName(name).trim().replace(/[. ]+$/, "") || empty;
}

// Where a Mirlo album lives inside the music folder: "<Artist>/<Album>"
export function albumFolderPath(artist: string | undefined, album: string | undefined): string {
  return `${safeSegment(artist ?? "", "Unknown Artist")}/${safeSegment(album ?? "", "Untitled")}`;
}

// "03 Title.flac", so a file browser lists songs in album order
export function songFileName(order: number | undefined, title: string, extension: string): string {
  const number = order ? `${String(order).padStart(2, "0")} ` : "";
  return `${safeSegment(`${number}${title}`, "Song")}.${extension}`;
}

export const bytesReader =
  (bytes: Uint8Array): ByteReader =>
  (offset, length) =>
    bytes.subarray(offset, offset + length);

// Comparing saved songs with the audio files found in the music folder: the ids of songs whose
// files are gone, and the paths of files not saved yet
export function folderChanges(
  tracks: { id: number; path?: string }[],
  found: string[],
): { gone: number[]; added: string[] } {
  const present = new Set(found);
  const known = new Set(tracks.map((t) => t.path));
  return {
    gone: tracks.filter((t) => t.path && !present.has(t.path)).map((t) => t.id),
    added: found.filter((path) => !known.has(path)),
  };
}

// A folder's cover among its images: one named cover, folder or front, else the first
export function pickCover(images: string[]): string | undefined {
  return images.find((p) => /(^|\/)(cover|folder|front)\.[^/]+$/i.test(p)) ?? images[0];
}

// Ties an unpacked song to its Mirlo track by the title Mirlo tags it with, then by track
// number. Mirlo names each song "<track number>-<title>"
export function matchTrack(tags: Tags, fileName: string, tracks: MirloTrack[]): MirloTrack | undefined {
  const title = tags.title?.trim().toLowerCase();
  const number = tags.track ?? parseInt(fileName, 10);
  return (
    tracks.find((t) => t.title.trim().toLowerCase() === title) ??
    tracks.find((t) => t.order === number)
  );
}

// "01 - Artist - Title.mp3" → track number, artist, and title; anything else becomes the title
export function namesFromFile(fileName: string): {
  title: string;
  artist: string;
  track?: number;
} {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");
  const numMatch = withoutExt.match(/^(\d+)\s*[-._\s]\s*/);
  const track = numMatch ? parseInt(numMatch[1], 10) : undefined;
  const base = withoutExt.replace(/^\d+\s*[-._\s]\s*/, "");
  const split = base.indexOf(" - ");
  if (split === -1) return { title: base, artist: "", track };
  return { artist: base.slice(0, split), title: base.slice(split + 3), track };
}

// What a song of your own shows: its tags first, then its file name, then its folder's name
export function songDetails(
  tags: Tags,
  fileName: string,
  index: number,
  fallbackAlbum?: string,
  fallbackArtist?: string,
) {
  const named = namesFromFile(fileName);
  return {
    title: tags.title || named.title,
    artist: tags.artist || named.artist || fallbackArtist || "Unknown Artist",
    albumTitle: tags.album || fallbackAlbum || "Imported Audio",
    order: tags.track ?? named.track ?? index + 1,
  };
}
