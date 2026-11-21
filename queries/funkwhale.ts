import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { isExcludedContent } from "@/queries/excludedContent";
import { SHARE_HUB_URL } from "@/queries/shareHub";
import { audioTrackType, coverSizes, htmlToMarkdown, shuffle } from "@/scripts/utils";

export const DEFAULT_FUNKWHALE_POD = "open.audio";
const FUNKWHALE_ID_PREFIX = "funkwhale-";
const FUNKWHALE_ARTIST_PREFIX = "funkwhale-artist-";

type FunkwhaleCoverUrls = {
  original?: string | null;
  large_square_crop?: string | null;
  medium_square_crop?: string | null;
  small_square_crop?: string | null;
};

type FunkwhaleCover = {
  uuid?: string;
  urls?: FunkwhaleCoverUrls | null;
} | null;

type FunkwhaleDescription =
  | string
  | {
      text?: string | null;
      html?: string | null;
    }
  | null
  | undefined;

type FunkwhaleArtistCredit = {
  artist?: {
    id?: number;
    fid?: string;
  } | null;
  credit?: string;
  joinphrase?: string;
  index?: number;
};

type FunkwhaleActor = {
  fid?: string;
  preferred_username?: string;
  name?: string;
  domain?: string;
  full_username?: string;
  summary?: string | null;
} | null;

export type FunkwhaleRawAlbum = {
  id: number;
  fid?: string;
  title?: string;
  artist_credit?: FunkwhaleArtistCredit[];
  attributed_to?: FunkwhaleActor;
  cover?: FunkwhaleCover;
  tags?: string[];
  release_date?: string | null;
  creation_date?: string | null;
  description?: FunkwhaleDescription;
  tracks_count?: number;
  is_playable?: boolean | string;
};

export type FunkwhaleRawUpload = {
  uuid?: string;
  listen_url?: string;
  duration?: number | null;
  bitrate?: number | null;
  mimetype?: string;
  extension?: string;
};

export type FunkwhaleRawTrack = {
  id: number;
  fid?: string;
  title?: string;
  position?: number | null;
  disc_number?: number | null;
  listen_url?: string;
  uploads?: FunkwhaleRawUpload[];
  artist_credit?: FunkwhaleArtistCredit[];
  attributed_to?: FunkwhaleActor;
  album?: FunkwhaleRawAlbum | null;
  cover?: FunkwhaleCover;
  tags?: string[];
  creation_date?: string | null;
  is_playable?: boolean | string;
  content_category?: string | null;
};

export type FunkwhaleRawArtist = {
  id: number;
  fid?: string;
  name?: string;
  description?: FunkwhaleDescription;
  attributed_to?: FunkwhaleActor;
  cover?: FunkwhaleCover;
  banner?: FunkwhaleCover;
  tags?: string[];
  links?: string[];
  tracks_count?: number;
  creation_date?: string | null;
  content_category?: string | null;
  is_playable?: boolean | string;
  albums?: {
    fid?: string;
    cover?: FunkwhaleCover;
  }[];
};

type FunkwhalePaginatedResponse<T> = {
  count?: number | null;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

const knownAlbumsBySlug = new Map<string, AlbumProps>();
const knownArtistsById = new Map<
  number,
  { podHost: string; artistId: number; name: string }
>();

export function isKnownFunkwhaleArtistId(artistId: number): boolean {
  return knownArtistsById.has(artistId);
}

function normalizePodHost(podHost?: string): string | undefined {
  const raw = String(podHost || "").trim().toLowerCase();
  if (!raw) return undefined;
  let hostname = raw;
  if (raw.includes("://")) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "https:") return undefined;
      if (parsed.port && parsed.port !== "443") return undefined;
      hostname = parsed.hostname.toLowerCase();
    } catch {
      return undefined;
    }
  }
  hostname = hostname.replace(/^www\./, "").replace(/\.$/, "");
  if (
    !hostname ||
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    !/^[a-z0-9.-]+$/.test(hostname)
  ) {
    return undefined;
  }
  return hostname;
}

function fullyDecodeSlug(slug: string): string {
  let normalized = slug;
  while (normalized.includes("%") && /%[0-9a-fA-F]{2}/.test(normalized)) {
    try {
      const next = decodeURIComponent(normalized);
      if (next === normalized) break;
      normalized = next;
    } catch {
      break;
    }
  }
  return normalized;
}

function hashId(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

function encodeReleaseSlug(podHost: string, albumId: number | string): string {
  const host = normalizePodHost(podHost) || DEFAULT_FUNKWHALE_POD;
  return `${FUNKWHALE_ID_PREFIX}${host}-${String(albumId).trim()}`;
}

function decodeReleaseSlug(
  slug?: string,
): { podHost: string; albumId: number; releaseId: string } | undefined {
  if (!slug) return undefined;
  const normalized = fullyDecodeSlug(String(slug).trim());
  if (
    !normalized.startsWith(FUNKWHALE_ID_PREFIX) ||
    normalized.startsWith(FUNKWHALE_ARTIST_PREFIX)
  ) {
    return undefined;
  }
  const rest = normalized.slice(FUNKWHALE_ID_PREFIX.length);
  const match = rest.match(/^([a-z0-9.-]+)-(\d+)$/i);
  if (!match) return undefined;
  const podHost = normalizePodHost(match[1]);
  const albumId = Number(match[2]);
  if (!podHost || !Number.isSafeInteger(albumId) || albumId <= 0) return undefined;
  return { podHost, albumId, releaseId: `${podHost}/${albumId}` };
}

function encodeArtistSlug(podHost: string, artistId: number | string): string {
  const host = normalizePodHost(podHost) || DEFAULT_FUNKWHALE_POD;
  return `${FUNKWHALE_ARTIST_PREFIX}${host}-${String(artistId).trim()}`;
}

function decodeArtistSlug(
  slug?: string,
): { podHost: string; artistId: number; artistKey: string } | undefined {
  if (!slug) return undefined;
  const normalized = fullyDecodeSlug(String(slug).trim());
  if (!normalized.startsWith(FUNKWHALE_ARTIST_PREFIX)) return undefined;
  const rest = normalized.slice(FUNKWHALE_ARTIST_PREFIX.length);
  const match = rest.match(/^([a-z0-9.-]+)-(\d+)$/i);
  if (!match) return undefined;
  const podHost = normalizePodHost(match[1]);
  const artistId = Number(match[2]);
  if (!podHost || !Number.isSafeInteger(artistId) || artistId <= 0) return undefined;
  return { podHost, artistId, artistKey: `${podHost}/${artistId}` };
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function encodeBase64Url(input: string): string {
  const bytes = Array.from(new TextEncoder().encode(input));
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_ALPHABET[(triple >> 18) & 0x3f];
    out += BASE64_ALPHABET[(triple >> 12) & 0x3f];
    if (hasB1) out += BASE64_ALPHABET[(triple >> 6) & 0x3f];
    if (hasB2) out += BASE64_ALPHABET[triple & 0x3f];
  }
  return out;
}

export function decodeBase64Url(token: string): string | undefined {
  const clean = token.replace(/=+$/, "");
  if (!clean || clean.length % 4 === 1) return undefined;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_ALPHABET.indexOf(clean[i]);
    const c1 = BASE64_ALPHABET.indexOf(clean[i + 1]);
    const c2 = i + 2 < clean.length ? BASE64_ALPHABET.indexOf(clean[i + 2]) : -2;
    const c3 = i + 3 < clean.length ? BASE64_ALPHABET.indexOf(clean[i + 3]) : -2;
    if (c0 < 0 || c1 < 0 || c2 === -1 || c3 === -1) return undefined;
    bytes.push((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) bytes.push(((c1 & 0x0f) << 4) | (c2 >> 2));
    if (c3 >= 0) bytes.push(((c2 & 0x03) << 6) | c3);
  }
  try {
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return undefined;
  }
}

export function encodeFunkwhaleShareToken(
  releaseId: string,
  trackOrder?: number | string,
): string {
  const payload =
    trackOrder !== undefined && trackOrder !== ""
      ? `${releaseId}#${trackOrder}`
      : releaseId;
  return `fw${encodeBase64Url(payload)}`;
}

export function decodeFunkwhaleShareToken(token: string): {
  podHost: string;
  albumId: number;
  trackOrder?: string;
} | undefined {
  const raw = token.startsWith("fw") ? token.slice(2) : token;
  const decoded = decodeBase64Url(raw);
  if (!decoded) return undefined;
  const [releasePart, trackPart] = decoded.split("#");
  const slashIdx = releasePart.indexOf("/");
  if (slashIdx <= 0) return undefined;
  const podHost = normalizePodHost(releasePart.slice(0, slashIdx));
  const albumId = Number(releasePart.slice(slashIdx + 1));
  if (!podHost || !Number.isSafeInteger(albumId) || albumId <= 0) return undefined;
  const trackOrder = trackPart && /^\d+$/.test(trackPart.trim()) ? trackPart.trim() : undefined;
  return { podHost, albumId, trackOrder };
}

function hasUsableCover(cover?: FunkwhaleCover): boolean {
  const urls = cover?.urls;
  if (!urls) return false;
  return Boolean(
    urls.large_square_crop ||
      urls.medium_square_crop ||
      urls.original ||
      urls.small_square_crop,
  );
}

/**
 * Builds a permanent share-hub proxy URL for Funkwhale cover images because pods
 * using S3 object storage (such as open.audio) issue short-lived presigned URLs.
 */
export function getFunkwhaleCoverUrl(opts: {
  podHost: string;
  albumId?: number;
  artistId?: number;
}): string {
  const origin = new URL(SHARE_HUB_URL).origin;
  const coverUrl = new URL(`${origin}/funkwhale/cover`);
  coverUrl.searchParams.set("pod", opts.podHost);
  if (opts.albumId !== undefined) {
    coverUrl.searchParams.set("album", String(opts.albumId));
  } else if (opts.artistId !== undefined) {
    coverUrl.searchParams.set("artist", String(opts.artistId));
  }
  return coverUrl.toString();
}

function stripDomainHandle(credit: string): string {
  return credit.replace(/@[a-z0-9.-]+\.[a-z]{2,}$/i, "").trim();
}

export function formatFunkwhaleArtistCredit(
  artistCredit?: FunkwhaleArtistCredit[],
  attributedTo?: FunkwhaleActor,
): string {
  if (Array.isArray(artistCredit) && artistCredit.length > 0) {
    const sorted = [...artistCredit].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    let combined = "";
    for (let i = 0; i < sorted.length; i++) {
      const part = stripDomainHandle(String(sorted[i]?.credit || ""));
      if (!part) continue;
      if (combined) {
        const prevJoin = sorted[i - 1]?.joinphrase;
        combined += prevJoin && prevJoin.trim() ? prevJoin : ", ";
      }
      combined += part;
    }
    const clean = combined.replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
    if (clean) return clean;
  }
  const fallback =
    attributedTo?.name ||
    attributedTo?.preferred_username ||
    (attributedTo?.full_username ? stripDomainHandle(attributedTo.full_username) : "");
  return (fallback || "Unknown Artist").trim();
}

export function extractFunkwhaleDescription(desc: FunkwhaleDescription): string {
  if (!desc) return "";
  if (typeof desc === "string") {
    return htmlToMarkdown(desc).trim();
  }
  if (desc.text && desc.text.trim()) {
    return desc.text.trim();
  }
  if (desc.html && desc.html.trim()) {
    return htmlToMarkdown(desc.html).trim();
  }
  return "";
}

function isPlayableFlag(val: boolean | string | undefined): boolean {
  return val !== false && val !== "false";
}

function recordKnownAlbum(album: AlbumProps, podHost: string, rawArtistId?: number): void {
  knownAlbumsBySlug.set(album.urlSlug, album);
  if (album.artistId && rawArtistId) {
    knownArtistsById.set(album.artistId, {
      podHost,
      artistId: rawArtistId,
      name: album.artist.name,
    });
  }
}

export function toFunkwhaleAlbumProps(
  raw: FunkwhaleRawAlbum,
  podHost: string = DEFAULT_FUNKWHALE_POD,
): AlbumProps {
  const urlSlug = encodeReleaseSlug(podHost, raw.id);
  const albumIdHash = hashId(`funkwhale-album:${podHost}:${raw.id}`);
  const artistName = formatFunkwhaleArtistCredit(raw.artist_credit, raw.attributed_to);
  const primaryArtistId = raw.artist_credit?.[0]?.artist?.id;
  const artistIdHash = hashId(
    `funkwhale-artist:${podHost}:${primaryArtistId || artistName.toLowerCase()}`,
  );
  const artistUrlSlug = primaryArtistId
    ? encodeArtistSlug(podHost, primaryArtistId)
    : "";
  const coverUrl = hasUsableCover(raw.cover)
    ? getFunkwhaleCoverUrl({ podHost, albumId: raw.id })
    : "";
  const tags = Array.isArray(raw.tags)
    ? Array.from(new Set(raw.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)))
    : [];
  const sourceUrl = `https://${podHost}/library/albums/${raw.id}`;

  const album: AlbumProps = {
    id: albumIdHash,
    trackGroupId: albumIdHash,
    title: (raw.title || `Album ${raw.id}`).trim(),
    artistId: artistIdHash,
    artist: {
      id: artistIdHash,
      name: artistName,
      urlSlug: artistUrlSlug,
      bio: raw.attributed_to?.summary ? htmlToMarkdown(raw.attributed_to.summary) : "",
      activityPub: true,
      enabled: true,
      createdAt: raw.creation_date || "",
      supportUrl: primaryArtistId
        ? `https://${podHost}/library/artists/${primaryArtistId}`
        : sourceUrl,
      trackGroups: [],
      userId: 0,
    },
    urlSlug,
    releaseDate: raw.release_date || raw.creation_date || "",
    about: extractFunkwhaleDescription(raw.description),
    tags,
    source: "Funkwhale",
    sourceUrl,
    cover: { sizes: coverSizes(coverUrl) },
    userTrackGroupPurchases: [],
  };

  recordKnownAlbum(album, podHost, primaryArtistId);
  return album;
}

export function toFunkwhaleTrack(
  raw: FunkwhaleRawTrack,
  index: number,
  album: AlbumProps,
  podHost: string = DEFAULT_FUNKWHALE_POD,
): RNTrack | undefined {
  if (!isPlayableFlag(raw.is_playable)) return undefined;
  const rawListen = raw.listen_url || raw.uploads?.[0]?.listen_url;
  if (!rawListen) return undefined;

  let streamUrl: string;
  try {
    streamUrl = new URL(rawListen, `https://${podHost}`).href;
  } catch {
    return undefined;
  }

  const artwork = album.cover?.sizes?.[600] || "";
  const durationVal = raw.uploads?.[0]?.duration;
  const duration =
    typeof durationVal === "number" && Number.isFinite(durationVal) && durationVal > 0
      ? durationVal
      : undefined;
  const order = typeof raw.position === "number" && raw.position > 0 ? raw.position : index + 1;
  const artistName =
    raw.artist_credit?.length
      ? formatFunkwhaleArtistCredit(raw.artist_credit, raw.attributed_to)
      : album.artist.name;
  const { tracks: _omittedTracks, ...trackGroupSummary } = album;

  return {
    id: hashId(`funkwhale-track:${podHost}:${raw.id}`),
    title: (raw.title || `Track ${order}`).trim(),
    artist: artistName,
    artwork,
    url: streamUrl,
    queueIndex: index,
    trackGroupId: album.id,
    order,
    duration,
    isPreview: true,
    allowIndividualSale: false,
    headers: {},
    type: audioTrackType(streamUrl),
    source: "Funkwhale",
    sourceUrl: album.sourceUrl,
    audio: { url: streamUrl, duration },
    trackGroup: { ...trackGroupSummary },
  };
}

async function fetchFunkwhaleJson<T>(
  podHost: string,
  pathAndQuery: string,
  signal?: AbortSignal,
): Promise<T> {
  const url = `https://${podHost}${pathAndQuery.startsWith("/") ? "" : "/"}${pathAndQuery}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Funkwhale request failed (${podHost}): ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function fetchFunkwhaleAlbums(
  take: number = 40,
  signal?: AbortSignal,
  podHost: string = DEFAULT_FUNKWHALE_POD,
): Promise<AlbumProps[]> {
  const safeHost = normalizePodHost(podHost) || DEFAULT_FUNKWHALE_POD;
  const pageSize = Math.min(Math.max(take * 2, 40), 100);
  const data = await fetchFunkwhaleJson<FunkwhalePaginatedResponse<FunkwhaleRawAlbum>>(
    safeHost,
    `/api/v2/albums?playable=true&ordering=-creation_date&page_size=${pageSize}`,
    signal,
  );

  const out: AlbumProps[] = [];
  for (const raw of data.results || []) {
    if (!raw?.id || !isPlayableFlag(raw.is_playable)) continue;
    if ((raw.tracks_count ?? 0) <= 0 || !hasUsableCover(raw.cover)) continue;
    const album = toFunkwhaleAlbumProps(raw, safeHost);
    if (isExcludedContent([album.title, album.artist?.name], album.tags)) continue;
    out.push(album);
    if (out.length >= take) break;
  }
  return out;
}

export function queryFunkwhaleAlbums(take: number = 40) {
  return queryOptions({
    queryKey: ["funkwhaleAlbums", take],
    queryFn: ({ signal }) => fetchFunkwhaleAlbums(take, signal),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export async function fetchFunkwhaleAlbum(
  releaseSlug: string,
  signal?: AbortSignal,
): Promise<AlbumProps> {
  const decoded = decodeReleaseSlug(releaseSlug);
  if (!decoded) {
    throw new Error("Invalid Funkwhale release identifier.");
  }
  const { podHost, albumId } = decoded;

  const [rawAlbum, rawTracksRes] = await Promise.all([
    fetchFunkwhaleJson<FunkwhaleRawAlbum>(podHost, `/api/v2/albums/${albumId}`, signal),
    fetchFunkwhaleJson<FunkwhalePaginatedResponse<FunkwhaleRawTrack>>(
      podHost,
      `/api/v2/tracks?album=${albumId}&playable=true&page_size=100`,
      signal,
    ),
  ]);

  const album = toFunkwhaleAlbumProps(rawAlbum, podHost);
  const sortedRawTracks = [...(rawTracksRes.results || [])].sort((a, b) => {
    const discDiff = (a.disc_number ?? 1) - (b.disc_number ?? 1);
    if (discDiff !== 0) return discDiff;
    return (a.position ?? 0) - (b.position ?? 0);
  });

  album.tracks = sortedRawTracks
    .map((tr, index) => toFunkwhaleTrack(tr, index, album, podHost))
    .filter((tr): tr is RNTrack => Boolean(tr));

  if (album.tracks.length === 0) {
    throw new Error(`Funkwhale album contains no playable tracks: ${podHost}/${albumId}`);
  }

  recordKnownAlbum(album, podHost, rawAlbum.artist_credit?.[0]?.artist?.id);
  return album;
}

export async function fetchFunkwhaleArtist(
  artistSlugOrId: string,
  signal?: AbortSignal,
): Promise<Artist | undefined> {
  const trimmed = String(artistSlugOrId || "").trim();
  if (!trimmed) return undefined;

  let target = decodeArtistSlug(trimmed);
  if (!target && /^\d+$/.test(trimmed)) {
    const known = knownArtistsById.get(Number(trimmed));
    if (known) {
      target = {
        podHost: known.podHost,
        artistId: known.artistId,
        artistKey: `${known.podHost}/${known.artistId}`,
      };
    }
  }
  if (!target) return undefined;

  const { podHost, artistId } = target;
  const [rawArtist, rawAlbumsRes] = await Promise.all([
    fetchFunkwhaleJson<FunkwhaleRawArtist>(podHost, `/api/v2/artists/${artistId}`, signal),
    fetchFunkwhaleJson<FunkwhalePaginatedResponse<FunkwhaleRawAlbum>>(
      podHost,
      `/api/v2/albums?artist=${artistId}&playable=true&page_size=50`,
      signal,
    ),
  ]);

  const trackGroups = (rawAlbumsRes.results || [])
    .filter((raw) => raw?.id && isPlayableFlag(raw.is_playable))
    .map((raw) => toFunkwhaleAlbumProps(raw, podHost))
    .filter((album) => !isExcludedContent([album.title, album.artist?.name], album.tags));

  const resolvedName = stripDomainHandle(
    rawArtist.name ||
      rawArtist.attributed_to?.name ||
      trackGroups[0]?.artist?.name ||
      `Artist ${artistId}`,
  );
  const avatarUri = hasUsableCover(rawArtist.cover)
    ? getFunkwhaleCoverUrl({ podHost, artistId })
    : trackGroups.find((tg) => tg.cover?.sizes?.[600])?.cover.sizes[600] || "";
  const supportUrl = `https://${podHost}/library/artists/${artistId}`;
  const bio =
    extractFunkwhaleDescription(rawArtist.description) ||
    (rawArtist.attributed_to?.summary
      ? htmlToMarkdown(rawArtist.attributed_to.summary).trim()
      : "") ||
    `${resolvedName} on Funkwhale (${podHost}).`;
  const linksJson: ArtistLink[] = (rawArtist.links || [])
    .filter((href) => /^https?:\/\//i.test(href))
    .map((url) => ({ url, linkLabel: url }));

  return {
    id: hashId(`funkwhale-artist:${podHost}:${artistId}`),
    name: resolvedName,
    urlSlug: encodeArtistSlug(podHost, artistId),
    bio,
    avatar: avatarUri
      ? {
          url: avatarUri,
          sizes: coverSizes(avatarUri),
          updatedAt: "",
        }
      : undefined,
    linksJson: linksJson.length > 0 ? linksJson : undefined,
    supportUrl,
    activityPub: true,
    enabled: true,
    createdAt: rawArtist.creation_date || "",
    trackGroups,
    userId: 0,
  };
}

export async function searchFunkwhaleAlbums(
  query: string,
  signal?: AbortSignal,
  podHost: string = DEFAULT_FUNKWHALE_POD,
): Promise<AlbumProps[]> {
  const clean = query.trim();
  const safeHost = normalizePodHost(podHost) || DEFAULT_FUNKWHALE_POD;
  if (clean.length < 2) return [];

  const data = await fetchFunkwhaleJson<FunkwhalePaginatedResponse<FunkwhaleRawAlbum>>(
    safeHost,
    `/api/v2/albums?playable=true&q=${encodeURIComponent(clean)}&page_size=25`,
    signal,
  );

  return (data.results || [])
    .filter((raw) => raw?.id && isPlayableFlag(raw.is_playable))
    .map((raw) => toFunkwhaleAlbumProps(raw, safeHost))
    .filter((album) => !isExcludedContent([album.title, album.artist?.name], album.tags));
}

export type FunkwhaleCatalogSearchResult = {
  albums: AlbumProps[];
  artists: {
    id: number;
    name: string;
    urlSlug: string;
    avatarUrl?: string;
    description?: string;
  }[];
  tracks: {
    id: string | number;
    title: string;
    artistName: string;
    artistSlug: string;
    albumSlug: string;
    imageUrl?: string;
    track?: RNTrack;
  }[];
};

export async function searchFunkwhaleCatalog(
  searchTerm: string,
  signal?: AbortSignal,
  podHost: string = DEFAULT_FUNKWHALE_POD,
): Promise<FunkwhaleCatalogSearchResult> {
  const clean = searchTerm.trim();
  const safeHost = normalizePodHost(podHost) || DEFAULT_FUNKWHALE_POD;
  if (clean.length < 2) {
    return { albums: [], artists: [], tracks: [] };
  }

  const encoded = encodeURIComponent(clean);
  const [albumsRes, artistsRes, tracksRes] = await Promise.allSettled([
    fetchFunkwhaleJson<FunkwhalePaginatedResponse<FunkwhaleRawAlbum>>(
      safeHost,
      `/api/v2/albums?playable=true&q=${encoded}&page_size=20`,
      signal,
    ),
    fetchFunkwhaleJson<FunkwhalePaginatedResponse<FunkwhaleRawArtist>>(
      safeHost,
      `/api/v2/artists?playable=true&q=${encoded}&page_size=15`,
      signal,
    ),
    fetchFunkwhaleJson<FunkwhalePaginatedResponse<FunkwhaleRawTrack>>(
      safeHost,
      `/api/v2/tracks?playable=true&q=${encoded}&page_size=25`,
      signal,
    ),
  ]);

  const albumsBySlug = new Map<string, AlbumProps>();
  if (albumsRes.status === "fulfilled") {
    for (const raw of albumsRes.value.results || []) {
      if (!raw?.id || !isPlayableFlag(raw.is_playable)) continue;
      const album = toFunkwhaleAlbumProps(raw, safeHost);
      if (isExcludedContent([album.title, album.artist?.name], album.tags)) continue;
      albumsBySlug.set(album.urlSlug, album);
    }
  }

  const artistsOut: FunkwhaleCatalogSearchResult["artists"] = [];
  const seenArtists = new Set<string>();
  if (artistsRes.status === "fulfilled") {
    for (const raw of artistsRes.value.results || []) {
      if (!raw?.id || !isPlayableFlag(raw.is_playable)) continue;
      if (raw.content_category === "podcast") continue;
      const name = stripDomainHandle(raw.name || raw.attributed_to?.name || "");
      if (!name || isExcludedContent([name], raw.tags || [])) continue;
      const urlSlug = encodeArtistSlug(safeHost, raw.id);
      if (seenArtists.has(urlSlug)) continue;
      seenArtists.add(urlSlug);
      const avatarUrl = hasUsableCover(raw.cover)
        ? getFunkwhaleCoverUrl({ podHost: safeHost, artistId: raw.id })
        : undefined;
      artistsOut.push({
        id: hashId(`funkwhale-artist:${safeHost}:${raw.id}`),
        name,
        urlSlug,
        avatarUrl,
        description: extractFunkwhaleDescription(raw.description),
      });
    }
  }

  const tracksOut: FunkwhaleCatalogSearchResult["tracks"] = [];
  if (tracksRes.status === "fulfilled") {
    for (let i = 0; i < (tracksRes.value.results || []).length; i++) {
      const rawTrack = tracksRes.value.results![i];
      if (!rawTrack?.id || !rawTrack.album?.id) continue;
      if (rawTrack.content_category === "podcast") continue;
      if (!isPlayableFlag(rawTrack.is_playable)) continue;

      const album =
        albumsBySlug.get(encodeReleaseSlug(safeHost, rawTrack.album.id)) ||
        toFunkwhaleAlbumProps(rawTrack.album, safeHost);
      if (isExcludedContent([rawTrack.title, album.title, album.artist?.name], album.tags)) {
        continue;
      }
      if (!albumsBySlug.has(album.urlSlug)) {
        albumsBySlug.set(album.urlSlug, album);
      }

      const rnTrack = toFunkwhaleTrack(rawTrack, i, album, safeHost);
      if (!rnTrack) continue;
      tracksOut.push({
        id: rnTrack.id,
        title: rnTrack.title,
        artistName: rnTrack.artist,
        artistSlug: "funkwhale",
        albumSlug: album.urlSlug,
        imageUrl: album.cover?.sizes?.[120] || rnTrack.artwork,
        track: rnTrack,
      });
    }
  }

  return {
    albums: Array.from(albumsBySlug.values()),
    artists: artistsOut,
    tracks: tracksOut,
  };
}

export async function fetchFunkwhaleDiscoveryTracks(
  take: number = 2,
  signal?: AbortSignal,
): Promise<RNTrack[]> {
  if (take <= 0) return [];
  const albums = await fetchFunkwhaleAlbums(Math.max(take * 3, 12), signal);
  const pickedAlbums = shuffle(albums).slice(0, take);

  const settled = await Promise.allSettled(
    pickedAlbums.map((album) => fetchFunkwhaleAlbum(album.urlSlug, signal)),
  );

  const tracks: RNTrack[] = [];
  for (const res of settled) {
    if (res.status === "fulfilled" && res.value.tracks?.length) {
      const albumTracks = res.value.tracks;
      const randomTrack = albumTracks[Math.floor(Math.random() * albumTracks.length)];
      if (randomTrack) {
        tracks.push({
          ...randomTrack,
          autoplay: true,
        });
      }
    }
  }
  return tracks;
}

export const funkwhaleReleaseSlug = {
  encode: encodeReleaseSlug,
  decode: decodeReleaseSlug,
  encodeArtist: encodeArtistSlug,
  decodeArtist: decodeArtistSlug,
  siteUrl: (slug?: string) => {
    const decoded = decodeReleaseSlug(slug);
    return decoded ? `https://${decoded.podHost}/library/albums/${decoded.albumId}` : undefined;
  },
  artistRouteId: (slug?: string) => (decodeReleaseSlug(slug) ? "funkwhale" : undefined),
  artistPageRouteId: (trackGroup?: {
    artistId?: number | string;
    artist?: { name?: string; urlSlug?: string };
    urlSlug?: string;
    source?: string;
  }) => {
    if (!trackGroup) return "";
    if (
      trackGroup.artist?.urlSlug &&
      trackGroup.artist.urlSlug.startsWith(FUNKWHALE_ARTIST_PREFIX)
    ) {
      return trackGroup.artist.urlSlug;
    }
    if (trackGroup.source === "Funkwhale" && trackGroup.artistId) {
      return String(trackGroup.artistId);
    }
    return String(trackGroup.artistId || trackGroup.artist?.urlSlug || "");
  },
};
