import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// A song saved on the phone. Mirlo downloads keep their Mirlo track id, so the rest of the
// app treats them as the same song and plays the saved file. Files added from the phone
// get negative ids, which never collide with Mirlo's
export type DownloadedTrack = {
  id: number;
  title: string;
  artist: string;
  albumTitle?: string;
  artwork?: string;
  url: string; // file:// uri of the saved audio; on Android, Mirlo downloads sit in the Music folder
  folder?: string; // file:// uri of the album's app folder, which holds its cover
  duration?: number;
  bytes?: number;
  order?: number; // position within its album
  downloadedAt: number;
  source: "mirlo" | "file";
  // On web, songs live in the listener's music folder. `path` is the song's place inside it and
  // `coverPath` the file holding its cover (an image, or a song with the cover in its tags).
  // Storage keeps the paths; `url` and `artwork` are browser links made while the folder is open
  path?: string;
  coverPath?: string;
};

// Browser links for files in the music folder, by path
export type FolderLinks = { audio: Map<string, string>; covers: Map<string, string> };

// Phone songs play from a file:// or content:// uri that outlives the app; browser links don't
const isPhoneUri = (url: string) => /^(file|content):\/\//.test(url);

// What storage keeps of a song: browser links last only as long as the page, so songs in the
// web music folder keep their paths alone while phone files keep their uris
export function storedTrack(track: DownloadedTrack): DownloadedTrack {
  if (!track.path || isPhoneUri(track.url)) return track;
  return { ...track, url: "", artwork: track.coverPath ? undefined : track.artwork };
}

// A stored song with browser links for its files, when the music folder is open
export function linkedTrack(track: DownloadedTrack, links: FolderLinks): DownloadedTrack {
  if (!track.path || isPhoneUri(track.url)) return track;
  return {
    ...track,
    url: links.audio.get(track.path) ?? "",
    artwork: track.coverPath ? links.covers.get(track.coverPath) : track.artwork,
  };
}

const DOWNLOADS_STORAGE_KEY = "mirlo_blue_downloads_v2";

// Formats offered for Mirlo downloads; Mirlo also has WAV, ALAC, Opus, and smaller MP3s
export type DownloadFormat = "320.mp3" | "flac";
export const DOWNLOAD_FORMATS: { id: DownloadFormat; label: string }[] = [
  { id: "320.mp3", label: "MP3 320" },
  { id: "flac", label: "FLAC" },
];

// Mirlo builds the zip, the phone downloads it, then unpacks it
export type DownloadStage = "preparing" | "downloading" | "unpacking";

type DownloadListener = (tracks: DownloadedTrack[]) => void;
const listeners = new Set<DownloadListener>();

// In-memory copy so the player can look up a saved file without waiting on storage
let downloads: DownloadedTrack[] = [];
let isLoaded = false;
let folderLinks: FolderLinks = { audio: new Map(), covers: new Map() };

async function persist(next: DownloadedTrack[]) {
  const stored = next.map(storedTrack);
  downloads = stored.map((t) => linkedTrack(t, folderLinks));
  isLoaded = true;
  await AsyncStorage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(stored));
  listeners.forEach((listener) => listener(downloads));
}

export async function getDownloadedTracks(): Promise<DownloadedTrack[]> {
  if (isLoaded) return downloads;
  try {
    const raw = await AsyncStorage.getItem(DOWNLOADS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    downloads = Array.isArray(parsed) ? parsed.map((t) => linkedTrack(t, folderLinks)) : [];
  } catch (err) {
    console.error("Failed to load downloads:", err);
    downloads = [];
  }
  isLoaded = true;
  return downloads;
}

// Gives songs in the music folder their browser links; the web build calls this when the
// folder opens. Links no song uses any more are released
export async function setFolderLinks(links: FolderLinks): Promise<void> {
  const used = new Set([...links.audio.values(), ...links.covers.values()]);
  [...folderLinks.audio.values(), ...folderLinks.covers.values()]
    .filter((link) => !used.has(link))
    .forEach((link) => URL.revokeObjectURL(link));
  folderLinks = links;
  await persist(await getDownloadedTracks());
}

// The Android app's saved songs, shown as the phone sends them. The phone keeps the list, so
// the page stores nothing of its own
export function showDownloads(tracks: DownloadedTrack[]): void {
  downloads = tracks;
  isLoaded = true;
  listeners.forEach((listener) => listener(downloads));
}

// Newest first; a song downloaded again replaces its earlier copy
export async function saveDownloadedTracks(tracks: DownloadedTrack[]): Promise<void> {
  const current = await getDownloadedTracks();
  const ids = new Set(tracks.map((t) => t.id));
  await persist([...tracks, ...current.filter((t) => !ids.has(t.id))]);
}

export async function forgetDownloadedTracks(trackIds: number[]): Promise<void> {
  const ids = new Set(trackIds);
  const current = await getDownloadedTracks();
  await persist(current.filter((t) => !ids.has(t.id)));
}

export function subscribeDownloads(listener: DownloadListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The saved songs, kept current as downloads come and go
export function useDownloads(): DownloadedTrack[] {
  const [tracks, setTracks] = useState<DownloadedTrack[]>(downloads);
  useEffect(() => {
    if (!isLoaded) {
      getDownloadedTracks().then(setTracks);
    } else {
      setTracks((prev) => (prev === downloads ? prev : downloads));
    }
    return subscribeDownloads(setTracks);
  }, []);
  return tracks;
}

export const nameKey = (text?: string) =>
  (text || "").toLowerCase().replace(/[^a-z0-9\u00c0-\uffff]/g, "");

// Two albums are the same when the titles match and one artist name holds the other
export function sameAlbum(
  a: { title?: string; artist?: string },
  b: { title?: string; artist?: string },
): boolean {
  const artistA = nameKey(a.artist);
  const artistB = nameKey(b.artist);
  return (
    nameKey(a.title) === nameKey(b.title) &&
    (artistA.includes(artistB) || artistB.includes(artistA))
  );
}

// The saved copy of a song: the same Mirlo track, or a phone file with the same title from the
// same album. Songs in a music folder that isn't open yet have no link and wait for it
export function findDownload(track: {
  id?: number;
  title?: string;
  trackGroup?: { title?: string; artist?: { name?: string } };
}): DownloadedTrack | undefined {
  const playable = downloads.filter((t) => t.url);
  const byId = track.id === undefined ? undefined : playable.find((t) => t.id === track.id);
  if (byId || !track.title || !track.trackGroup?.title) return byId;
  const album = { title: track.trackGroup.title, artist: track.trackGroup.artist?.name };
  return playable.find(
    (t) =>
      t.source === "file" &&
      nameKey(t.title) === nameKey(track.title) &&
      sameAlbum({ title: t.albumTitle, artist: t.artist }, album),
  );
}

// A saved song as a player track
export function downloadToTrack(dl: DownloadedTrack): RNTrack {
  return {
    id: dl.id,
    title: dl.title,
    artist: dl.artist,
    artwork: dl.artwork,
    url: dl.url,
    queueIndex: 0,
    trackGroupId: 0,
    trackGroup: {
      id: 0,
      releaseDate: "",
      trackGroupId: 0,
      title: dl.albumTitle || "On this phone",
      artist: { name: dl.artist } as any,
      artistId: 0,
      urlSlug: "",
      cover: { sizes: { 300: dl.artwork, 600: dl.artwork } as any },
    },
    audio: { url: dl.url, duration: dl.duration },
    isPreview: false,
    order: dl.order || 1,
    headers: {},
    allowIndividualSale: false,
    downloadAlbum: albumKeyOf(dl),
  } as RNTrack;
}

// Saved songs that belong together: an unpacked Mirlo album, or files imported under one name
export type DownloadedAlbum = {
  key: string;
  title: string;
  artist: string;
  artwork?: string;
  tracks: DownloadedTrack[];
  totalBytes: number;
  downloadedAt: number;
};

export function albumKeyOf(track: DownloadedTrack): string {
  if (track.folder) return track.folder;
  return `album:${(track.albumTitle || "Imported Audio").trim().toLowerCase()}`;
}

// Albums with no Mirlo or Faircamp page get one made from their files, and so do their
// artists. Their route ids start with "saved-" and hold a short hash of the album key or
// artist name, which stays safe in a URL
export const SAVED_PREFIX = "saved-";
export const SAVED_SOURCE = "On this phone";

function shortHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

export const savedAlbumSlug = (albumKey: string) => SAVED_PREFIX + shortHash(albumKey);
export const savedArtistSlug = (artist: string) => SAVED_PREFIX + shortHash(nameKey(artist));

export function savedAlbumPage(album: DownloadedAlbum): AlbumProps {
  const art = album.artwork;
  return {
    id: album.tracks[0]?.id ?? 0,
    trackGroupId: 0,
    releaseDate: "",
    title: album.title,
    artistId: 0,
    urlSlug: savedAlbumSlug(album.key),
    artist: { name: album.artist, urlSlug: savedArtistSlug(album.artist) } as Artist,
    cover: { sizes: { 120: art, 300: art, 600: art } } as any,
    source: SAVED_SOURCE,
    tracks: album.tracks.map((t) => ({
      ...downloadToTrack(t),
      trackArtists: t.artist !== album.artist ? [{ artistName: t.artist }] : undefined,
    })),
  } as AlbumProps;
}

export async function findSavedAlbumPage(slug: string): Promise<AlbumProps> {
  const albums = groupTracksIntoAlbums(await getDownloadedTracks());
  const album = albums.find((a) => savedAlbumSlug(a.key) === slug);
  if (!album) throw new Error("This album is no longer on this phone");
  return savedAlbumPage(album);
}

export async function findSavedArtistPage(slug: string): Promise<Artist> {
  const albums = groupTracksIntoAlbums(await getDownloadedTracks()).filter(
    (a) => savedArtistSlug(a.artist) === slug,
  );
  if (albums.length === 0) throw new Error("This artist is no longer on this phone");
  return {
    id: 0,
    name: albums[0].artist,
    bio: "",
    urlSlug: slug,
    trackGroups: albums.map(savedAlbumPage),
  } as unknown as Artist;
}

// Newest albums first, each with its songs in album order
export function groupTracksIntoAlbums(tracks: DownloadedTrack[]): DownloadedAlbum[] {
  const albums = new Map<string, DownloadedAlbum>();

  for (const track of tracks) {
    const key = albumKeyOf(track);
    const album = albums.get(key);
    if (!album) {
      albums.set(key, {
        key,
        title: track.albumTitle || "Imported Audio",
        artist: track.artist || "Unknown Artist",
        artwork: track.artwork,
        tracks: [track],
        totalBytes: track.bytes || 0,
        downloadedAt: track.downloadedAt,
      });
      continue;
    }
    album.tracks.push(track);
    album.totalBytes += track.bytes || 0;
    album.artwork ||= track.artwork;
    album.downloadedAt = Math.max(album.downloadedAt, track.downloadedAt);
  }

  return Array.from(albums.values())
    .map((album) => ({
      ...album,
      tracks: album.tracks.sort((a, b) => (a.order || 0) - (b.order || 0) || a.id - b.id),
    }))
    .sort((a, b) => b.downloadedAt - a.downloadedAt);
}

// Whether an album is saved on the device. Downloaded files carry a title and artist, and an
// album with the same title and artist is that album.
export function downloadedAlbumMatcher(downloads: DownloadedTrack[]) {
  const saved = groupTracksIntoAlbums(downloads);
  return (trackGroup: any) =>
    saved.some((a) =>
      sameAlbum(
        { title: a.title, artist: a.artist },
        { title: trackGroup?.title, artist: trackGroup?.artist?.name },
      ),
    );
}

// Changes what every song in an album shows. Imported albums are grouped by title, so a new
// title can merge into another album; the album's key afterwards is returned
export async function updateAlbum(
  albumKey: string,
  changes: Partial<Pick<DownloadedTrack, "albumTitle" | "artist" | "artwork">>,
): Promise<string> {
  const current = await getDownloadedTracks();
  let newKey = albumKey;
  await persist(
    current.map((t) => {
      if (albumKeyOf(t) !== albumKey) return t;
      const updated = { ...t, ...changes };
      newKey = albumKeyOf(updated);
      return updated;
    }),
  );
  return newKey;
}
