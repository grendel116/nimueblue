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

// An album folder created by the listener in Downloads, kept even while it has no tracks
export type CreatedAlbum = {
  key: string;
  title: string;
  artist: string;
  artwork?: string;
  createdAt: number;
};

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
const CREATED_ALBUMS_STORAGE_KEY = "mirlo_blue_created_albums_v1";

type DownloadListener = (tracks: DownloadedTrack[]) => void;
const listeners = new Set<DownloadListener>();

// In-memory copy so the player can look up a saved file without waiting on storage
let downloads: DownloadedTrack[] = [];
let createdAlbums: CreatedAlbum[] = [];
let isLoaded = false;
let folderLinks: FolderLinks = { audio: new Map(), covers: new Map() };

function notify() {
  const snapshot = [...downloads];
  listeners.forEach((listener) => listener(snapshot));
}

async function persist(next: DownloadedTrack[]) {
  const stored = next.map(storedTrack);
  downloads = stored.map((t) => linkedTrack(t, folderLinks));
  isLoaded = true;
  await AsyncStorage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(stored));
  notify();
}

async function persistCreatedAlbums(next: CreatedAlbum[]) {
  createdAlbums = next;
  await AsyncStorage.setItem(CREATED_ALBUMS_STORAGE_KEY, JSON.stringify(next));
  notify();
}

export async function getDownloadedTracks(): Promise<DownloadedTrack[]> {
  if (isLoaded) return downloads;
  try {
    const [rawTracks, rawAlbums] = await Promise.all([
      AsyncStorage.getItem(DOWNLOADS_STORAGE_KEY),
      AsyncStorage.getItem(CREATED_ALBUMS_STORAGE_KEY),
    ]);
    const parsedTracks = rawTracks ? JSON.parse(rawTracks) : [];
    const parsedAlbums = rawAlbums ? JSON.parse(rawAlbums) : [];
    downloads = Array.isArray(parsedTracks)
      ? parsedTracks.map((t) => linkedTrack(t, folderLinks))
      : [];
    createdAlbums = Array.isArray(parsedAlbums) ? parsedAlbums : [];
  } catch (err) {
    console.error("Failed to load downloads:", err);
    downloads = [];
    createdAlbums = [];
  }
  isLoaded = true;
  return downloads;
}

export async function getCreatedAlbums(): Promise<CreatedAlbum[]> {
  if (!isLoaded) await getDownloadedTracks();
  return createdAlbums;
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
export function showDownloads(tracks: DownloadedTrack[], albums?: CreatedAlbum[]): void {
  downloads = tracks;
  if (albums) createdAlbums = albums;
  isLoaded = true;
  notify();
}

function pickCanonicalAlbumArtist(tracks: DownloadedTrack[], explicitArtist?: string): string {
  if (explicitArtist && explicitArtist.trim() && explicitArtist.trim() !== "Unknown Artist") {
    return explicitArtist.trim();
  }
  const counts = new Map<string, { name: string; count: number }>();
  for (const t of tracks) {
    const raw = (t.artist || "").trim();
    if (!raw || raw === "Unknown Artist") continue;
    const k = raw.toLowerCase();
    const cur = counts.get(k);
    if (cur) cur.count += 1;
    else counts.set(k, { name: raw, count: 1 });
  }
  let best = "";
  let bestCount = 0;
  for (const entry of counts.values()) {
    if (entry.count > bestCount) {
      best = entry.name;
      bestCount = entry.count;
    }
  }
  return best || tracks[0]?.artist?.trim() || "Unknown Artist";
}

function normalizeAlbumInheritance(tracks: DownloadedTrack[]): DownloadedTrack[] {
  const byKey = new Map<string, DownloadedTrack[]>();
  for (const t of tracks) {
    const key = albumKeyOf(t);
    const list = byKey.get(key);
    if (list) list.push(t);
    else byKey.set(key, [t]);
  }

  const canonicalByKey = new Map<string, { title: string; artist: string; artwork?: string }>();
  for (const [key, group] of byKey.entries()) {
    const created = createdAlbums.find((c) => c.key === key);
    if (key === albumTitleKey("Imported Audio") && !created) continue;
    const title = (created?.title || group[0]?.albumTitle || "Imported Audio").trim();
    const artist = pickCanonicalAlbumArtist(group, created?.artist);
    const artwork = created?.artwork || group.find((t) => t.artwork)?.artwork;
    canonicalByKey.set(key, { title, artist, artwork });
  }

  return tracks.map((t) => {
    const key = albumKeyOf(t);
    const canonical = canonicalByKey.get(key);
    if (!canonical) return t;
    if (
      t.albumTitle === canonical.title &&
      t.artist === canonical.artist &&
      (t.artwork || !canonical.artwork)
    ) {
      return t;
    }
    return {
      ...t,
      albumTitle: canonical.title,
      artist: canonical.artist,
      artwork: t.artwork ?? canonical.artwork,
      folder: undefined,
    };
  });
}

// Newest first; a song downloaded again replaces its earlier copy
export async function saveDownloadedTracks(tracks: DownloadedTrack[]): Promise<void> {
  const current = await getDownloadedTracks();
  const ids = new Set(tracks.map((t) => t.id));
  const merged = [...tracks, ...current.filter((t) => !ids.has(t.id))];
  await persist(normalizeAlbumInheritance(merged));
}

export async function replaceDownloadedLibrary(
  tracks: DownloadedTrack[],
  albums?: CreatedAlbum[],
): Promise<void> {
  await getDownloadedTracks();
  if (albums) {
    createdAlbums = albums;
    await AsyncStorage.setItem(CREATED_ALBUMS_STORAGE_KEY, JSON.stringify(albums));
  }
  await persist(normalizeAlbumInheritance(tracks));
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
      getDownloadedTracks().then(() => setTracks([...downloads]));
    } else {
      setTracks((prev) => (prev === downloads ? prev : [...downloads]));
    }
    return subscribeDownloads(setTracks);
  }, []);
  return tracks;
}

export const nameKey = (text?: string) =>
  (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\uffff]/g, "");

export function cleanTrackTitle(title?: string): string {
  const withoutExt = (title || "").replace(/\.(mp3|flac|m4a|opus|ogg|wav|aac)$/i, "").trim();
  return withoutExt.replace(/^\d+\s*[-._\s]\s*/, "").trim() || withoutExt;
}

export function sameTrackTitle(a?: string, b?: string): boolean {
  const keyA = nameKey(cleanTrackTitle(a));
  const keyB = nameKey(cleanTrackTitle(b));
  return Boolean(keyA && keyB && (keyA === keyB || nameKey(a) === nameKey(b)));
}

function trackMatchesOnlineTitle(
  st: { title?: string; path?: string },
  onlineTitle?: string,
): boolean {
  if (sameTrackTitle(st.title, onlineTitle)) return true;
  if (st.path) {
    const baseName = st.path.split("/").pop() || "";
    if (sameTrackTitle(baseName, onlineTitle)) return true;
  }
  return false;
}

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
  artist?: string;
  trackArtists?: { artistName?: string }[];
  trackGroup?: { title?: string; artist?: { name?: string } };
}): DownloadedTrack | undefined {
  const playable = downloads.filter((t) => t.url);
  const byId = track.id === undefined ? undefined : playable.find((t) => t.id === track.id);
  if (byId || !track.title) return byId;
  const groupTitle = track.trackGroup?.title;
  const groupArtist = track.trackGroup?.artist?.name || track.artist;
  if (groupTitle) {
    const album = { title: groupTitle, artist: groupArtist };
    const byAlbum = playable.find(
      (t) =>
        trackMatchesOnlineTitle(t, track.title) &&
        (sameAlbum({ title: t.albumTitle, artist: t.artist }, album) ||
          nameKey(t.albumTitle) === nameKey(groupTitle)),
    );
    if (byAlbum) return byAlbum;
  }
  const groupArtistKey = nameKey(groupArtist);
  return playable.find((t) => {
    if (!trackMatchesOnlineTitle(t, track.title)) return false;
    const tArtist = nameKey(t.artist);
    if (tArtist) {
      if (
        groupArtistKey &&
        (tArtist.includes(groupArtistKey) || groupArtistKey.includes(tArtist))
      ) {
        return true;
      }
      if (
        track.trackArtists?.some((ta) => {
          const k = nameKey(ta.artistName);
          return Boolean(k && (k === tArtist || k.includes(tArtist) || tArtist.includes(k)));
        })
      ) {
        return true;
      }
    }
    return false;
  });
}

// A saved song as a player track
export function downloadToTrack(dl: DownloadedTrack): RNTrack {
  return {
    id: dl.id,
    title: dl.title,
    artist: dl.artist,
    artwork: dl.artwork,
    url: dl.url,
    duration: dl.duration,
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

// Saved songs that belong together: an unpacked Mirlo album, files imported under one name,
// or an album folder created in Downloads
export type DownloadedAlbum = {
  key: string;
  title: string;
  artist: string;
  artwork?: string;
  tracks: DownloadedTrack[];
  totalBytes: number;
  downloadedAt: number;
};

export const albumTitleKey = (title?: string) =>
  `album:${(title || "Imported Audio").trim().toLowerCase()}`;

export function albumKeyOf(track: DownloadedTrack): string {
  return albumTitleKey(track.albumTitle);
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
      ...downloadToTrack({ ...t, artist: album.artist || t.artist, albumTitle: album.title || t.albumTitle }),
      trackArtists: undefined,
    })),
  } as AlbumProps;
}

// Pairs an online Faircamp/Mirlo album's tracks with any downloaded tracks on the device,
// and appends additional or duplicate downloaded tracks in the album folder so they can
// be played, renamed, moved, or deleted directly from the album page
export function mergeAlbumWithDownloads(
  onlineAlbum: AlbumProps,
  savedAlbum?: DownloadedAlbum,
  allDownloads: DownloadedTrack[] = downloads,
): AlbumProps {
  const onlineTracks = onlineAlbum.tracks ?? [];
  const savedTracks = savedAlbum?.tracks ?? [];
  const pairedByOnlineIdx = new Map<number, DownloadedTrack>();
  const usedSavedIds = new Set<number>();

  // Pass 1: exact track ID match
  for (const [idx, ot] of onlineTracks.entries()) {
    const match =
      savedTracks.find((st) => !usedSavedIds.has(st.id) && st.id === ot.id) ??
      allDownloads.find((st) => !usedSavedIds.has(st.id) && st.id === ot.id);
    if (match) {
      pairedByOnlineIdx.set(idx, match);
      usedSavedIds.add(match.id);
    }
  }

  // Pass 2: normalized track title match in savedAlbum
  for (const [idx, ot] of onlineTracks.entries()) {
    if (pairedByOnlineIdx.has(idx)) continue;
    const match = savedTracks.find(
      (st) => !usedSavedIds.has(st.id) && trackMatchesOnlineTitle(st, ot.title),
    );
    if (match) {
      pairedByOnlineIdx.set(idx, match);
      usedSavedIds.add(match.id);
    }
  }

  // Pass 3: track number match for renamed tracks when the album is downloaded
  if (savedTracks.length > 0 && (pairedByOnlineIdx.size > 0 || savedTracks.length >= onlineTracks.length)) {
    for (const [idx, ot] of onlineTracks.entries()) {
      if (pairedByOnlineIdx.has(idx)) continue;
      const expectedOrder = ot.order ?? idx + 1;
      const match = savedTracks.find(
        (st) => !usedSavedIds.has(st.id) && (st.order ?? 0) === expectedOrder,
      );
      if (match) {
        pairedByOnlineIdx.set(idx, match);
        usedSavedIds.add(match.id);
      }
    }
  }

  // Pass 4: match loose tracks in allDownloads that belong to this online album
  const onlineTitleKey = nameKey(onlineAlbum.title);
  const onlineArtistKey = nameKey(onlineAlbum.artist?.name);
  for (const [idx, ot] of onlineTracks.entries()) {
    if (pairedByOnlineIdx.has(idx)) continue;
    const match = allDownloads.find((st) => {
      if (usedSavedIds.has(st.id) || !trackMatchesOnlineTitle(st, ot.title)) return false;
      if (onlineTitleKey && nameKey(st.albumTitle) === onlineTitleKey) return true;
      if (
        sameAlbum(
          { title: st.albumTitle, artist: st.artist },
          { title: onlineAlbum.title, artist: onlineAlbum.artist?.name },
        )
      ) {
        return true;
      }
      const stArtistKey = nameKey(st.artist);
      if (stArtistKey) {
        if (
          onlineArtistKey &&
          (stArtistKey.includes(onlineArtistKey) || onlineArtistKey.includes(stArtistKey))
        ) {
          return true;
        }
        if (
          ot.trackArtists?.some((ta) => {
            const k = nameKey(ta.artistName);
            return Boolean(
              k && (k === stArtistKey || k.includes(stArtistKey) || stArtistKey.includes(k)),
            );
          })
        ) {
          return true;
        }
      }
      const untaggedAlbum =
        !st.albumTitle || /^(imported audio|music|downloads?|unknown( album)?)$/i.test(st.albumTitle.trim());
      if (!untaggedAlbum) return false;
      return pairedByOnlineIdx.size > 0 || Boolean(savedAlbum);
    });
    if (match) {
      pairedByOnlineIdx.set(idx, match);
      usedSavedIds.add(match.id);
    }
  }

  const explicitCreated = savedAlbum
    ? createdAlbums.find((c) => c.key === savedAlbum.key)
    : undefined;
  const resolvedTitle = (
    explicitCreated?.title ||
    savedAlbum?.title ||
    onlineAlbum.title ||
    ""
  ).trim();
  const resolvedArtist = (
    explicitCreated?.artist ||
    onlineAlbum.artist?.name ||
    savedAlbum?.artist ||
    ""
  ).trim();
  const targetAlbumKey = savedAlbum?.key ?? albumTitleKey(resolvedTitle);

  const mergedTracks: RNTrack[] = [];
  for (const [idx, ot] of onlineTracks.entries()) {
    const st = pairedByOnlineIdx.get(idx);
    if (st) {
      const localUrl = st.url || ot.audio?.url || ot.url || "";
      const dur = st.duration || ot.audio?.duration || ot.duration;
      const inheritedArtist = resolvedArtist || st.artist || ot.artist;
      mergedTracks.push({
        ...ot,
        id: st.id,
        title: st.title || cleanTrackTitle(ot.title) || ot.title,
        artist: inheritedArtist,
        trackArtists: undefined,
        isPreview: false,
        headers: {},
        order: st.order ?? ot.order ?? idx + 1,
        url: localUrl,
        duration: dur,
        audio: {
          ...ot.audio,
          url: localUrl,
          duration: dur,
        },
        downloadAlbum: targetAlbumKey,
      });
    } else {
      mergedTracks.push(ot);
    }
  }

  for (const st of savedTracks) {
    if (!usedSavedIds.has(st.id)) {
      const inheritedArtist = resolvedArtist || st.artist;
      mergedTracks.push({
        ...downloadToTrack({
          ...st,
          artist: inheritedArtist,
          albumTitle: resolvedTitle || st.albumTitle,
        }),
        trackArtists: undefined,
      });
    }
  }

  mergedTracks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return {
    ...onlineAlbum,
    title: resolvedTitle || onlineAlbum.title,
    artist: onlineAlbum.artist
      ? { ...onlineAlbum.artist, name: resolvedArtist || onlineAlbum.artist.name }
      : ({ name: resolvedArtist, urlSlug: savedArtistSlug(resolvedArtist) } as Artist),
    tracks: mergedTracks,
  };
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

  for (const created of createdAlbums) {
    albums.set(created.key, {
      key: created.key,
      title: created.title,
      artist: created.artist,
      artwork: created.artwork,
      tracks: [],
      totalBytes: 0,
      downloadedAt: created.createdAt,
    });
  }

  for (const track of tracks) {
    const key = albumKeyOf(track);
    const album = albums.get(key);
    if (!album) {
      albums.set(key, {
        key,
        title: (track.albumTitle || "Imported Audio").trim(),
        artist: (track.artist || "Unknown Artist").trim(),
        artwork: track.artwork,
        tracks: [track],
        totalBytes: track.bytes || 0,
        downloadedAt: track.downloadedAt,
      });
      continue;
    }
    if (album.tracks.length === 0 && !createdAlbums.some((c) => c.key === key)) {
      album.title = (track.albumTitle || "Imported Audio").trim();
      album.artist = (track.artist || "Unknown Artist").trim();
    }
    album.tracks.push(track);
    album.totalBytes += track.bytes || 0;
    album.artwork ||= track.artwork;
    album.downloadedAt = Math.max(album.downloadedAt, track.downloadedAt);
  }

  return Array.from(albums.values())
    .map((album) => {
      const created = createdAlbums.find((c) => c.key === album.key);
      const isNamedAlbum = album.key !== albumTitleKey("Imported Audio") || Boolean(created);
      const canonicalArtist = isNamedAlbum
        ? pickCanonicalAlbumArtist(album.tracks, created?.artist)
        : album.artist;
      const canonicalTitle = (created?.title || album.title).trim();
      return {
        ...album,
        title: canonicalTitle,
        artist: canonicalArtist,
        tracks: album.tracks
          .map((t) =>
            isNamedAlbum
              ? { ...t, albumTitle: canonicalTitle, artist: canonicalArtist }
              : t,
          )
          .sort((a, b) => (a.order || 0) - (b.order || 0) || Math.abs(a.id) - Math.abs(b.id)),
      };
    })
    .sort((a, b) => b.downloadedAt - a.downloadedAt);
}

// Whether an album is saved on the device. Downloaded files carry a title and artist, and an
// album with the same title and artist is that album.
export function downloadedAlbumMatcher(downloads: DownloadedTrack[]) {
  const saved = groupTracksIntoAlbums(downloads);
  return (trackGroup: any) =>
    saved.some(
      (a) =>
        sameAlbum(
          { title: a.title, artist: a.artist },
          { title: trackGroup?.title, artist: trackGroup?.artist?.name },
        ) ||
        (trackGroup?.title && nameKey(a.title) === nameKey(trackGroup.title)),
    );
}

// Creates or updates an album folder in Downloads and returns its key
export async function createDownloadedAlbum(title: string, artist: string): Promise<string> {
  const current = await getDownloadedTracks();
  const cleanTitle = title.trim() || "Untitled Album";
  const cleanArtist = artist.trim() || "Unknown Artist";
  const key = albumTitleKey(cleanTitle);
  const existing = createdAlbums.find((c) => c.key === key);
  const next: CreatedAlbum = {
    key,
    title: cleanTitle,
    artist: cleanArtist,
    artwork: existing?.artwork,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await persistCreatedAlbums([next, ...createdAlbums.filter((c) => c.key !== key)]);
  if (current.some((t) => albumKeyOf(t) === key)) {
    await persist(
      current.map((t) =>
        albumKeyOf(t) === key
          ? { ...t, albumTitle: cleanTitle, artist: cleanArtist, folder: undefined }
          : t,
      ),
    );
  }
  return key;
}

export async function removeCreatedAlbum(albumKey: string): Promise<void> {
  await getDownloadedTracks();
  if (!createdAlbums.some((c) => c.key === albumKey)) return;
  await persistCreatedAlbums(createdAlbums.filter((c) => c.key !== albumKey));
}

// Changes what every song in an album shows. Imported albums are grouped by title, so a new
// title can merge into another album; the album's key afterwards is returned
export async function updateAlbum(
  albumKey: string,
  changes: Partial<Pick<DownloadedTrack, "albumTitle" | "artist" | "artwork">>,
  extraTrackIds?: number[],
): Promise<string> {
  const current = await getDownloadedTracks();
  const extraIds = new Set(extraTrackIds ?? []);
  const cleanChanges: Partial<Pick<DownloadedTrack, "albumTitle" | "artist" | "artwork">> = {
    ...changes,
    ...(changes.albumTitle !== undefined
      ? { albumTitle: changes.albumTitle.trim() || "Untitled Album" }
      : {}),
    ...(changes.artist !== undefined
      ? { artist: changes.artist.trim() || "Unknown Artist" }
      : {}),
  };
  let newKey =
    cleanChanges.albumTitle !== undefined ? albumTitleKey(cleanChanges.albumTitle) : albumKey;

  const existingTracks = current.filter(
    (t) => albumKeyOf(t) === albumKey || albumKeyOf(t) === newKey || extraIds.has(t.id),
  );
  const created =
    createdAlbums.find((c) => c.key === albumKey) ??
    createdAlbums.find((c) => c.key === newKey);
  const resolvedTitle =
    cleanChanges.albumTitle ||
    created?.title ||
    existingTracks[0]?.albumTitle ||
    "Untitled Album";
  const resolvedArtist =
    cleanChanges.artist ||
    created?.artist ||
    existingTracks[0]?.artist ||
    "Unknown Artist";
  const resolvedArtwork =
    cleanChanges.artwork !== undefined
      ? cleanChanges.artwork
      : created?.artwork ?? existingTracks.find((t) => t.artwork)?.artwork;

  const updatedCreated: CreatedAlbum = {
    key: newKey,
    title: resolvedTitle,
    artist: resolvedArtist,
    artwork: resolvedArtwork,
    createdAt: created?.createdAt ?? Date.now(),
  };
  await persistCreatedAlbums([
    updatedCreated,
    ...createdAlbums.filter((c) => c.key !== albumKey && c.key !== newKey),
  ]);

  await persist(
    current.map((t) => {
      if (albumKeyOf(t) !== albumKey && albumKeyOf(t) !== newKey && !extraIds.has(t.id)) {
        return t;
      }
      const updated = {
        ...t,
        albumTitle: resolvedTitle,
        artist: resolvedArtist,
        folder: undefined,
        ...cleanChanges,
      };
      newKey = albumKeyOf(updated);
      return updated;
    }),
  );
  return newKey;
}

// Updates metadata on one or more tracks (e.g., renaming or bulk editing)
export async function updateDownloadedTracks(
  trackIds: number[],
  changes: Partial<
    Pick<
      DownloadedTrack,
      | "title"
      | "artist"
      | "albumTitle"
      | "artwork"
      | "order"
      | "duration"
      | "url"
      | "path"
      | "coverPath"
      | "bytes"
    >
  >,
): Promise<void> {
  const idSet = new Set(trackIds);
  const current = await getDownloadedTracks();
  await persist(
    current.map((t) => {
      if (!idSet.has(t.id)) return t;
      return {
        ...t,
        ...(changes.albumTitle !== undefined ? { folder: undefined } : {}),
        ...changes,
      };
    }),
  );
}

// Moves tracks into a target album, inheriting the album's title, artist, and cover art,
// and numbering them sequentially after any tracks already in the album
export async function moveTracksToAlbum(
  trackIds: number[],
  target: { title: string; artist: string; artwork?: string },
): Promise<string> {
  const idSet = new Set(trackIds);
  const current = await getDownloadedTracks();
  const cleanTitle = target.title.trim() || "Untitled Album";
  const cleanArtist = target.artist.trim() || "Unknown Artist";
  const targetKey = albumTitleKey(cleanTitle);

  const existingInTarget = current.filter((t) => !idSet.has(t.id) && albumKeyOf(t) === targetKey);
  const created = createdAlbums.find((c) => c.key === targetKey);
  const targetArtwork =
    target.artwork || created?.artwork || existingInTarget.find((t) => t.artwork)?.artwork;
  let maxOrder = existingInTarget.reduce((max, t) => Math.max(max, t.order || 0), 0);

  // Preserve the moved tracks' relative order
  const moving = current
    .filter((t) => idSet.has(t.id))
    .sort((a, b) => (a.order || 0) - (b.order || 0) || Math.abs(a.id) - Math.abs(b.id));
  const nextOrders = new Map<number, number>();
  for (const t of moving) {
    maxOrder += 1;
    nextOrders.set(t.id, maxOrder);
  }

  const updatedCreated: CreatedAlbum = {
    key: targetKey,
    title: cleanTitle,
    artist: cleanArtist,
    artwork: targetArtwork,
    createdAt: created?.createdAt ?? Date.now(),
  };
  await persistCreatedAlbums([
    updatedCreated,
    ...createdAlbums.filter((c) => c.key !== targetKey),
  ]);

  await persist(
    current.map((t) => {
      if (idSet.has(t.id)) {
        return {
          ...t,
          albumTitle: cleanTitle,
          artist: cleanArtist,
          artwork: targetArtwork ?? t.artwork,
          folder: undefined,
          order: nextOrders.get(t.id) ?? t.order,
        };
      }
      if (albumKeyOf(t) === targetKey) {
        return {
          ...t,
          albumTitle: cleanTitle,
          artist: cleanArtist,
          artwork: t.artwork ?? targetArtwork,
          folder: undefined,
        };
      }
      return t;
    }),
  );
  return targetKey;
}
