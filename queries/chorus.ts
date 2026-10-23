import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { API_ROOT } from "@/constants/api-root";
import { API_KEY } from "@/constants/api-key";
import { getListenerUserIdSync } from "@/scripts/listenerIdentity";
import { audioTrackType, coverSizes, htmlToMarkdown } from "@/scripts/utils";
import type {
  ChorusRoot,
  ChorusArtist,
  ChorusAlbum,
  ChorusTrack,
  ChorusQueryOptions,
  ChorusDeletedEntity,
  FederationNode,
} from "@/types/chorus";

/**
 * Chorus catalogs read directly by the app.
 */
export const INNATE_CHORUS_FEEDS: FederationNode[] = [
  {
    id: "mirlo-space",
    name: "Mirlo Space",
    url: API_ROOT,
    endpoint: "/v1/sm/canimus.json",
    enabled: true,
    type: "mirlo",
  },
];

/**
 * Normalizes an arbitrary URL to a canonical lowercase host + path string without trailing slash.
 */
export function normalizeCanonicalUrl(url?: string): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    const host = parsed.host.toLowerCase();
    let pathname = parsed.pathname.replace(/\/+$/, "");
    if (!pathname) pathname = "/";
    return `${parsed.protocol}//${host}${pathname}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
}

/**
 * Resolves the display source name for a given feed or stream URL.
 */
export function resolveFeedSourceName(url?: string): string {
  if (!url || typeof url !== "string") return "Mirlo Space";
  const trimmed = url.trim();
  if (trimmed.startsWith("/") || (!trimmed.includes(".") && !trimmed.startsWith("http"))) {
    return "Mirlo Space";
  }
  const normalized = normalizeCanonicalUrl(trimmed);
  for (const feed of INNATE_CHORUS_FEEDS) {
    const feedNormalized = normalizeCanonicalUrl(feed.url);
    if (feedNormalized && (normalized === feedNormalized || normalized.startsWith(feedNormalized))) {
      return feed.name;
    }
  }
  if (trimmed.includes("mirlo.space") || (API_ROOT && trimmed.startsWith(API_ROOT))) {
    return "Mirlo Space";
  }
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.replace(/^www\./, "");
    return host || "Mirlo Space";
  } catch {
    return "Mirlo Space";
  }
}

/**
 * Parses and validates raw JSON into a typed ChorusRoot structure.
 */
export function parseChorusFeed(raw: unknown, defaultUrl: string = API_ROOT): ChorusRoot {
  if (!raw || typeof raw !== "object") {
    return {
      type: "root",
      url: defaultUrl,
      children: [],
      deleted: [],
    };
  }

  const obj = raw as Record<string, any>;
  const url = typeof obj.url === "string" && obj.url ? obj.url : defaultUrl;
  const children = Array.isArray(obj.children) ? (obj.children as ChorusArtist[]) : [];
  const deleted = Array.isArray(obj.deleted) ? obj.deleted : [];

  return {
    type: "root",
    url,
    children,
    deleted,
  };
}

/**
 * Extracts a stable numeric identifier from a string or number, or falls back to a deterministic hash.
 */
function toNumericId(value: string | number | undefined, fallbackSeed: string): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed) && String(parsed) === value.trim()) return parsed;
  }
  const str = String(value || fallbackSeed);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

/**
 * Converts a Chorus track into an RNTrack object ready for TrackPlayer.
 */
export function chorusTrackToRNTrack(
  track: ChorusTrack,
  album: ChorusAlbum,
  artistName: string,
  index: number,
  fallbackCover: string,
  feedRootUrl: string,
  sourceName?: string,
  sourceUrl?: string,
): RNTrack {
  const media = track.media?.[0];
  const rawStreamUrl = media?.src || track.url;
  const streamUrl = rawStreamUrl.startsWith("http")
    ? rawStreamUrl
    : `${feedRootUrl.replace(/\/$/, "")}/${rawStreamUrl.replace(/^\//, "")}`;

  const trackId = toNumericId(track.id, `${album.name}-${track.name}-${index}`);
  const albumId = toNumericId(album.uid, `${artistName}-${album.name}`);
  const artwork = album.images?.cover?.src || fallbackCover;
  const resolvedSource = sourceName || resolveFeedSourceName(feedRootUrl);
  const resolvedSourceUrl = sourceUrl || feedRootUrl;

  const isExternalStream = streamUrl.includes("/stream/external/");
  const headers = isExternalStream
    ? {
        "mirlo-api-key": API_KEY,
        "social-music-userid": getListenerUserIdSync(),
      }
    : { "mirlo-api-key": API_KEY };

  const purchaseLinks = (album.links || [])
    .filter((l: any) => l.rel === "purchase" || l.rel === "payment" || l.rel === "store")
    .map((l: any) => ({
      label: l.label || l.name || "Store",
      url: l.href,
    }));

  const artistSlugFromAlbumUrl = /^https?:\/\/[^/]+\/([^/]+)\/release\//.exec(album.url || "")?.[1] || "";

  const albumProps: AlbumProps = {
    id: albumId,
    trackGroupId: albumId,
    title: album.name,
    artistId: toNumericId(undefined, artistName),
    artist: {
      id: toNumericId(undefined, artistName),
      name: artistName,
      urlSlug: artistSlugFromAlbumUrl,
      bio: "",
      activityPub: false,
      enabled: true,
      createdAt: album.release_date || new Date().toISOString(),
      trackGroups: [],
      userId: 0,
    },
    urlSlug: album.url.split("/").pop() || "",
    releaseDate: album.release_date || "",
    about: album.description || "",
    source: resolvedSource,
    sourceUrl: resolvedSourceUrl,
    purchaseLinks: purchaseLinks.length > 0 ? purchaseLinks : undefined,
    cover: { sizes: coverSizes(artwork) },
  };

  return {
    id: trackId,
    title: track.name,
    artist: artistName,
    artwork,
    url: streamUrl,
    queueIndex: index,
    trackGroupId: albumId,
    order: track.track || index + 1,
    duration: track.duration,
    isPreview: true,
    allowIndividualSale: false,
    headers,
    type: audioTrackType(streamUrl),
    source: resolvedSource,
    sourceUrl: resolvedSourceUrl,
    audio: {
      url: streamUrl,
      duration: track.duration,
    },
    trackGroup: albumProps,
  };
}

/**
 * Extracts normalized lowercase tags from explicit tag arrays and hashtag mentions in text.
 */
export function extractChorusTags(
  tags?: string[],
  ...textSources: (string | undefined)[]
): string[] {
  const result = new Set<string>();

  if (Array.isArray(tags)) {
    for (const t of tags) {
      if (typeof t === "string") {
        const clean = t.toLowerCase().replace(/^#/, "").trim();
        if (clean) result.add(clean);
      }
    }
  }

  for (const text of textSources) {
    if (!text || typeof text !== "string") continue;
    const hashtagMatches = text.match(/#([a-zA-Z0-9_-]+)/g);
    if (hashtagMatches) {
      for (const m of hashtagMatches) {
        const clean = m.slice(1).toLowerCase().trim();
        if (clean) result.add(clean);
      }
    }
  }

  return Array.from(result);
}

/**
 * Converts a Chorus album into an AlbumProps object, filtering revoked tracks.
 */
export function chorusAlbumToAlbumProps(
  album: ChorusAlbum,
  artist: ChorusArtist,
  feedRootUrl: string,
  deletedCanonical: Set<string> = new Set(),
  sourceName?: string,
  sourceUrl?: string,
): AlbumProps {
  const artistName = album.artist || artist.name;
  const coverUrl = album.images?.cover?.src || artist.images?.cover?.src || "";
  const albumId = toNumericId(album.uid, `${artistName}-${album.name}`);
  const artistId = toNumericId(undefined, artist.name);
  const resolvedSource = sourceName || resolveFeedSourceName(feedRootUrl);
  const resolvedSourceUrl = sourceUrl || feedRootUrl;
  const tags = extractChorusTags(
    album.tags,
    album.name,
    album.description,
    artist.description,
    artist.summary,
  );

  const purchaseLinks = (album.links || [])
    .filter((l: any) => l.rel === "purchase" || l.rel === "payment" || l.rel === "store")
    .map((l: any) => ({
      label: l.label || l.name || "Store",
      url: l.href,
    }));

  const albumProps: AlbumProps = {
    id: albumId,
    trackGroupId: albumId,
    title: album.name,
    artistId,
    artist: {
      id: artistId,
      name: artistName,
      urlSlug: artist.url ? artist.url.split("/").pop() || "" : "",
      bio: htmlToMarkdown(artist.description || artist.summary || ""),
      activityPub: false,
      enabled: true,
      createdAt: album.release_date || new Date().toISOString(),
      trackGroups: [],
      userId: 0,
    },
    urlSlug: album.url.split("/").pop() || "",
    releaseDate: album.release_date || "",
    about: htmlToMarkdown(album.description || ""),
    tags,
    source: resolvedSource,
    sourceUrl: resolvedSourceUrl,
    purchaseLinks: purchaseLinks.length > 0 ? purchaseLinks : undefined,
    cover: { sizes: coverSizes(coverUrl) },
  };

  const tracks = (album.children || [])
    .filter((t) => {
      if (t.url && deletedCanonical.has(normalizeCanonicalUrl(t.url))) return false;
      const mediaSrc = t.media?.[0]?.src;
      if (mediaSrc && deletedCanonical.has(normalizeCanonicalUrl(mediaSrc))) return false;
      return true;
    })
    .map((t, idx) =>
      chorusTrackToRNTrack(t, album, artistName, idx, coverUrl, feedRootUrl, resolvedSource, resolvedSourceUrl),
    );

  albumProps.tracks = tracks;
  return albumProps;
}

/**
 * Balances album representation across artists so no single artist's catalog
 * monopolizes federated discovery feeds or carousels.
 */
export function distributeFairChorusAlbums(
  albums: AlbumProps[],
  maxPerArtist: number = 2,
): AlbumProps[] {
  const counts = new Map<string, number>();
  const out: AlbumProps[] = [];

  for (const album of albums) {
    const artistKey = (album.artist?.name || String(album.artistId || "")).toLowerCase().trim();
    const current = counts.get(artistKey) || 0;
    if (current < maxPerArtist) {
      counts.set(artistKey, current + 1);
      out.push(album);
    }
  }

  return out;
}

/**
 * Converts all albums in a Chorus feed to an array of AlbumProps,
 * removing any that have been revoked or deleted.
 */
export function chorusToAlbums(feed: ChorusRoot, feedInfo?: FederationNode): AlbumProps[] {
  const deletedCanonical = new Set(
    (feed.deleted || [])
      .map((d) => normalizeCanonicalUrl(d.url))
      .filter(Boolean),
  );
  const feedRootUrl = feed.url || feedInfo?.url || API_ROOT;
  const sourceName = feedInfo?.name || resolveFeedSourceName(feedRootUrl);
  const sourceUrl = feedInfo?.url || feedRootUrl;
  const out: AlbumProps[] = [];

  for (const artist of feed.children || []) {
    if (artist.url && deletedCanonical.has(normalizeCanonicalUrl(artist.url))) continue;

    for (const album of artist.children || []) {
      if (album.url && deletedCanonical.has(normalizeCanonicalUrl(album.url))) continue;
      out.push(chorusAlbumToAlbumProps(album, artist, feedRootUrl, deletedCanonical, sourceName, sourceUrl));
    }
  }

  return out;
}

/**
 * Purges entities returned in the feed's deleted array from local downloads,
 * viewing history, and active player queue using exact canonical URIs and slugs.
 */
export async function purgeChorusDeletedEntities(
  deleted?: ChorusDeletedEntity[],
): Promise<void> {
  if (!deleted || deleted.length === 0) return;

  const deletedCanonicalUrls = new Set<string>();
  const deletedAlbumSlugs = new Set<string>();

  for (const item of deleted) {
    if (!item.url || typeof item.url !== "string") continue;
    const canonical = normalizeCanonicalUrl(item.url);
    if (canonical) {
      deletedCanonicalUrls.add(canonical);
      const segments = canonical.split("/").filter(Boolean);
      const lastSegment = segments[segments.length - 1];
      if (lastSegment) {
        deletedAlbumSlugs.add(lastSegment.toLowerCase());
      }
    }
  }

  if (deletedCanonicalUrls.size === 0) return;

  // 1. Purge from local offline downloads
  try {
    const { getDownloadedTracks, forgetDownloadedTracks } = require("@/scripts/downloadManager");
    const downloaded = await getDownloadedTracks();
    const toForget = downloaded
      .filter((t: any) => {
        const canonicalTrackUrl = normalizeCanonicalUrl(t.url);
        return deletedCanonicalUrls.has(canonicalTrackUrl);
      })
      .map((t: any) => t.id);
    if (toForget.length > 0) {
      await forgetDownloadedTracks(toForget);
    }
  } catch (err) {
    console.error("Failed to purge deleted entities from downloads:", err);
  }

  // 2. Purge from viewing history
  try {
    const { removeHistoryItems } = require("@/scripts/historyManager");
    await removeHistoryItems((item: any) => {
      const slug = (item.urlSlug || "").trim().toLowerCase();
      return Boolean(slug && deletedAlbumSlugs.has(slug));
    });
  } catch (err) {
    console.error("Failed to purge deleted entities from history:", err);
  }

  // 3. Purge from the player's queue
  try {
    const { playerConnection } = require("@/state/player/connection");
    const player = playerConnection();
    const { activeTrack, userQueue, upcoming } = player.snapshot();
    const tracks = [...(activeTrack ? [activeTrack] : []), ...userQueue, ...upcoming];
    const keys = tracks
      .filter((track: RNTrack) => {
        const canonicalUrl = normalizeCanonicalUrl(track.url);
        const songSlug = (track.trackGroup?.urlSlug || "").trim().toLowerCase();
        return (
          deletedCanonicalUrls.has(canonicalUrl) ||
          (Boolean(songSlug) && deletedAlbumSlugs.has(songSlug))
        );
      })
      .map((track: RNTrack) => track._queueKey)
      .filter(Boolean);
    if (keys.length > 0) await player.request({ type: "removeKeys", keys });
  } catch (err) {
    console.error("Failed to purge deleted entities from the queue:", err);
  }
}

/**
 * Fetches a Chorus feed from a specified or default host.
 */
export async function fetchChorusFeed(
  options: ChorusQueryOptions = {},
  signal?: AbortSignal,
): Promise<ChorusRoot> {
  const host = (options.host || API_ROOT).replace(/\/$/, "");
  const endpoint = (options.endpoint || "/v1/sm/canimus.json").replace(/^\/?/, "/");
  const params = new URLSearchParams();

  if (options.fromDate) params.append("fromDate", options.fromDate);
  if (typeof options.skip === "number") params.append("skip", String(options.skip));
  if (typeof options.take === "number") params.append("take", String(options.take));

  const queryString = params.toString();
  const url = `${host}${endpoint}${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Chorus feed fetch failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  return parseChorusFeed(json, host);
}

/**
 * Queries all configured Chorus catalogs in parallel, aggregating releases,
 * enforcing revocation compliance across all feeds, and updating discovered broadcasts and shows.
 */
export async function fetchFederatedChorusAlbums(
  options: ChorusQueryOptions = {},
  signal?: AbortSignal,
): Promise<AlbumProps[]> {
  const results = await Promise.allSettled(
    INNATE_CHORUS_FEEDS.map(async (feedInfo) => {
      const feed = await fetchChorusFeed(
        {
          host: feedInfo.url,
          endpoint: feedInfo.endpoint,
          take: options.take ?? 40,
          skip: options.skip,
          fromDate: options.fromDate,
        },
        signal,
      );
      return { feed, feedInfo };
    }),
  );

  const aggregatedAlbums: AlbumProps[] = [];
  const allDeletedEntities: ChorusDeletedEntity[] = [];

  for (const res of results) {
    if (res.status === "fulfilled") {
      const { feed, feedInfo } = res.value;
      if (feed.deleted && feed.deleted.length > 0) {
        allDeletedEntities.push(...feed.deleted);
      }
      const albums = chorusToAlbums(feed, feedInfo);
      aggregatedAlbums.push(...albums);
    } else {
      console.warn("Federated Chorus feed fetch failed:", res.reason);
    }
  }

  // Purge any revoked or deleted entities immediately
  if (allDeletedEntities.length > 0) {
    await purgeChorusDeletedEntities(allDeletedEntities);
  }

  // Deduplicate albums by title + artistName or URL slug
  const seenKeys = new Set<string>();
  const dedupedAlbums: AlbumProps[] = [];

  for (const album of aggregatedAlbums) {
    const key = `${album.artist?.name || ""}:${album.title}`.toLowerCase();
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      dedupedAlbums.push(album);
    }
  }

  // Sort by releaseDate descending
  dedupedAlbums.sort((a, b) => {
    const da = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
    const db = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
    return db - da;
  });

  return dedupedAlbums;
}

/**
 * Query options returning parsed AlbumProps[] aggregated innately across all network feeds.
 */
export function queryFederatedChorusAlbums(options: ChorusQueryOptions = {}) {
  return queryOptions({
    queryKey: ["federatedChorusAlbums", options],
    queryFn: ({ signal }) => fetchFederatedChorusAlbums(options, signal),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Resolves an album from the federated Chorus catalog by slug or artist identifier.
 */
export async function findChorusAlbum(
  slug: string,
  artistIdOrSlug?: string,
): Promise<AlbumProps | undefined> {
  const albums = await fetchFederatedChorusAlbums();
  const cleanSlug = slug.toLowerCase().trim();
  const cleanArtist = artistIdOrSlug ? String(artistIdOrSlug).toLowerCase().trim() : "";

  return albums.find((a) => {
    const albumSlug = (a.urlSlug || String(a.id)).toLowerCase().trim();
    if (albumSlug !== cleanSlug && String(a.id) !== cleanSlug) return false;
    if (cleanArtist) {
      const artSlug = (a.artist?.urlSlug || String(a.artistId) || a.artist?.name || "").toLowerCase().trim();
      return artSlug === cleanArtist || String(a.artistId) === cleanArtist || cleanArtist === "";
    }
    return true;
  });
}

/**
 * Resolves an artist and their discography from the federated Chorus catalog by slug or ID.
 */
export async function findChorusArtist(
  artistIdOrSlug: string,
  signal?: AbortSignal,
): Promise<Artist | undefined> {
  const clean = String(artistIdOrSlug || "").toLowerCase().trim();
  if (!clean) return undefined;

  const albums = await fetchFederatedChorusAlbums({}, signal);
  const matching = albums.filter((a) => {
    const artSlug = (a.artist?.urlSlug || "").toLowerCase().trim();
    const artName = (a.artist?.name || "").toLowerCase().trim();
    return (
      String(a.artistId) === clean ||
      (artSlug && artSlug === clean) ||
      (artName && artName === clean)
    );
  });

  if (matching.length === 0) return undefined;
  const primary = matching[0];
  const coverUri = primary.cover?.sizes?.[600] || "";

  return {
    ...primary.artist,
    id: primary.artistId,
    name: primary.artist.name,
    urlSlug: primary.artist.urlSlug || String(primary.artistId),
    bio: primary.artist.bio || (primary.sourceUrl ? `Source: ${primary.sourceUrl}` : ""),
    avatar: coverUri
      ? { url: coverUri, sizes: primary.cover.sizes, updatedAt: "" }
      : primary.artist.avatar,
    trackGroups: matching,
  };
}

