import type { ByteReader, Tags } from "./readTags";

// Naming, matching and describing saved song files; shared by the phone and web builds

export const AUDIO_FILE = /\.(mp3|flac|m4a|opus|ogg|wav|aac)$/i;
export const IMAGE_FILE = /\.(jpe?g|png|webp)$/i;
export const MUSIC_FOLDER_MANIFEST = "nimue-library.json";

export function isManifestFileName(name: string): boolean {
  return /(^|\/)nimue-library(\.json)+$/i.test(name.trim());
}

export type ManifestAlbumRecord = {
  title: string;
  artist: string;
  artwork?: string;
  createdAt?: number;
};

export type ManifestTrackRecord = {
  id: number;
  albumKey: string;
  title: string;
  order?: number;
  duration?: number;
};

export type MusicFolderManifest = {
  version: 1;
  updatedAt: number;
  albums: Record<string, ManifestAlbumRecord>;
  tracks: Record<string, ManifestTrackRecord>;
};

export function parseMusicFolderManifest(raw: string): MusicFolderManifest | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.albums !== "object" ||
      typeof parsed.tracks !== "object"
    ) {
      return null;
    }
    return {
      version: 1,
      updatedAt: Number(parsed.updatedAt) || Date.now(),
      albums: parsed.albums ?? {},
      tracks: parsed.tracks ?? {},
    };
  } catch {
    return null;
  }
}

export function buildMusicFolderManifest(
  tracks: {
    id: number;
    path?: string;
    title: string;
    artist: string;
    albumTitle?: string;
    order?: number;
    duration?: number;
    artwork?: string;
  }[],
  createdAlbums: {
    key: string;
    title: string;
    artist: string;
    artwork?: string;
    createdAt: number;
  }[],
): MusicFolderManifest {
  const albums: Record<string, ManifestAlbumRecord> = {};
  const trackRecords: Record<string, ManifestTrackRecord> = {};

  for (const album of createdAlbums) {
    if (!album.key) continue;
    albums[album.key] = {
      title: (album.title || "Imported Audio").trim(),
      artist: (album.artist || "Unknown Artist").trim(),
      ...(album.artwork ? { artwork: album.artwork } : {}),
      createdAt: album.createdAt || Date.now(),
    };
  }

  for (const track of tracks) {
    if (!track.path) continue;
    const albumTitle = (track.albumTitle || "Imported Audio").trim();
    const albumKey = `album:${albumTitle.toLowerCase()}`;
    if (!albums[albumKey]) {
      albums[albumKey] = {
        title: albumTitle,
        artist: (track.artist || "Unknown Artist").trim(),
        ...(track.artwork ? { artwork: track.artwork } : {}),
      };
    }
    trackRecords[track.path] = {
      id: track.id,
      albumKey,
      title: cleanTrackTitle(track.title) || track.title || "Song",
      ...(track.order !== undefined ? { order: track.order } : {}),
      ...(track.duration !== undefined && track.duration > 0 ? { duration: track.duration } : {}),
    };
  }

  return {
    version: 1,
    updatedAt: Date.now(),
    albums,
    tracks: trackRecords,
  };
}

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

export function cleanTrackTitle(title?: string): string {
  const withoutExt = (title || "").replace(AUDIO_FILE, "").trim();
  return withoutExt;
}

// Where a Mirlo album lives inside the music folder: "<Artist>/<Album>"
export function albumFolderPath(artist: string | undefined, album: string | undefined): string {
  return `${safeSegment(artist ?? "", "Unknown Artist")}/${safeSegment(album ?? "", "Untitled")}`;
}

// Universal schema file name in /music: "<Artist> - <Album> - <01> - <Title>.<ext>",
// or "<03> <Title>.<ext>" when artist and album are omitted
export function songFileName(
  order: number | undefined,
  title: string,
  extension: string,
  artist?: string,
  albumTitle?: string,
): string {
  const cleanTitle = safeSegment(cleanTrackTitle(title), "Song");
  if (artist !== undefined || albumTitle !== undefined) {
    const cleanArtist = safeSegment(artist ?? "", "Unknown Artist");
    const cleanAlbum = safeSegment(albumTitle ?? "", "Imported Audio");
    const num = String(order && order > 0 ? order : 1).padStart(2, "0");
    return `${cleanArtist} - ${cleanAlbum} - ${num} - ${cleanTitle}.${extension}`;
  }
  const number = order ? `${String(order).padStart(2, "0")} ` : "";
  return `${safeSegment(`${number}${cleanTitle}`, "Song")}.${extension}`;
}

export function fileExtension(pathOrName: string): string {
  const match = pathOrName.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return (match ? match[1] : "mp3").toLowerCase();
}

export function targetTrackPath(track: {
  title: string;
  artist?: string;
  albumTitle?: string;
  order?: number;
  path?: string;
  url?: string;
}): { dirPath: string; fileName: string; fullPath: string } {
  const ext = fileExtension(track.path || decodeURIComponent(track.url || "") || "mp3");
  const fileName = songFileName(
    track.order,
    track.title,
    ext,
    track.artist || "Unknown Artist",
    track.albumTitle || "Imported Audio",
  );
  return {
    dirPath: "",
    fileName,
    fullPath: fileName,
  };
}

export function folderAlbumAndArtist(dirPath: string): {
  album?: string;
  artist?: string;
} {
  const dirs = dirPath.split("/").filter(Boolean);
  if (dirs.length === 0) return {};
  const leaf = dirs[dirs.length - 1];
  const parsed = namesFromFile(leaf);
  const parentDir = dirs.length >= 2 ? dirs[dirs.length - 2] : undefined;
  return {
    album: parsed.title || leaf || undefined,
    artist: parsed.artist || parentDir || undefined,
  };
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

// "<Artist> - <Album> - <01> - <Title>.mp3" (universal schema) or "01 - Artist - Title.mp3"
// → track number, artist, album, and title; anything else becomes the title
export function namesFromFile(fileName: string): {
  title: string;
  artist: string;
  album?: string;
  track?: number;
} {
  const withoutExt = fileName.replace(AUDIO_FILE, "").replace(/\.[^.]+$/, "");
  const parts = withoutExt.split(" - ");
  if (parts.length >= 4 && /^\d+$/.test(parts[2].trim())) {
    return {
      artist: parts[0].trim(),
      album: parts[1].trim(),
      track: parseInt(parts[2].trim(), 10),
      title: parts.slice(3).join(" - ").trim(),
    };
  }
  if (parts.length === 3 && /^\d+\s+\S/.test(parts[2].trim())) {
    const m = parts[2].trim().match(/^(\d+)\s+(.*)$/)!;
    return {
      artist: parts[0].trim(),
      album: parts[1].trim(),
      track: parseInt(m[1], 10),
      title: m[2].trim(),
    };
  }
  const numMatch = withoutExt.match(/^(\d+)\s*[-._\s]\s*/);
  const track = numMatch ? parseInt(numMatch[1], 10) : undefined;
  const base = withoutExt.replace(/^\d+\s*[-._\s]\s*/, "");
  const split = base.indexOf(" - ");
  if (split === -1) return { title: base.trim(), artist: "", track };
  return { artist: base.slice(0, split).trim(), title: base.slice(split + 3).trim(), track };
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
  const cleanTitle = tags.title ? cleanTrackTitle(tags.title) : "";
  return {
    title: cleanTitle || named.title || "Song",
    artist: (tags.artist || named.artist || fallbackArtist || "Unknown Artist").trim(),
    albumTitle: (tags.album || named.album || fallbackAlbum || "Imported Audio").trim(),
    order: tags.track ?? named.track ?? index + 1,
    ...(tags.duration !== undefined ? { duration: tags.duration } : {}),
  };
}
