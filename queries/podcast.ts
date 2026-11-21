import { useMemo } from "react";
import { Platform } from "react-native";
import { queryOptions } from "@tanstack/react-query";
import type { TrackType } from "react-native-track-player";
import { coverSizes, decodeHtmlEntities, isQualityArtwork } from "@/scripts/utils";
import { API_KEY } from "@/constants/api-key";
import { getListenerUserIdSync } from "@/scripts/listenerIdentity";
import { SHARE_HUB_URL } from "@/queries/shareHub";
import {
  CustomPodcastSpec,
  MIGRATED_PODCAST_SPECS,
  getContentFilters,
  getCurationConfig,
  isExcludedContent,
  useCurationConfig,
} from "@/queries/excludedContent";

// Podcast and talk shows shown under Discussion on Home and in Search. Episodes are parsed from
// standard open podcast RSS feeds with direct audio enclosures. The base app uses open Castopod
// discovery and user-added RSS feeds; migrated shows remain in PODCAST_SHOWS for preset import
// and deep-link resolution.

export type PodcastEpisode = {
  id: string;
  title: string;
  pubDate: string;
  audioUrl: string;
  description: string;
  duration?: number;
  artwork?: string;
};

export type PodcastShow = {
  id: string;
  name: string;
  author: string;
  description: string;
  artwork: string;
  feedUrl: string;
  webUrl: string;
  supportUrl?: string;
  lastUpdated?: string;
  isCustom?: boolean;
  fetchEpisodes: (signal?: AbortSignal) => Promise<PodcastEpisode[]>;
};

export function decodeXml(text: string): string {
  if (!text) return "";
  const cleaned = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decodeHtmlEntities(cleaned).trim();
}

export function parseDuration(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parts = raw.split(":").map(Number);
  if (parts.some((p) => isNaN(p))) {
    const num = Number(raw);
    return isNaN(num) ? undefined : num;
  }
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function parsePodcastRss(xml: string, limit: number = 30): PodcastEpisode[] {
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  const episodes: PodcastEpisode[] = [];

  while ((match = itemRegex.exec(xml)) !== null && episodes.length < limit) {
    const item = match[1];
    const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
    const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const descMatch =
      item.match(/<description>([\s\S]*?)<\/description>/i) ||
      item.match(/<itunes:summary>([\s\S]*?)<\/itunes:summary>/i);
    const guidMatch = item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const encUrlMatch = item.match(/<enclosure[^>]+url="([^"]+)"/i);
    const encTypeMatch = item.match(/<enclosure[^>]+type="([^"]+)"/i);
    const durationMatch = item.match(/<itunes:duration>([\s\S]*?)<\/itunes:duration>/i);
    const itunesImgMatch = item.match(/<itunes:image\s+href="([^"]+)"/i);

    const enclosureUrl = encUrlMatch ? encUrlMatch[1] : undefined;
    const enclosureType = encTypeMatch ? encTypeMatch[1] : undefined;

    const isAudio =
      enclosureType?.startsWith("audio/") ||
      enclosureUrl?.includes(".mp3") ||
      enclosureUrl?.includes(".m4a");

    if (enclosureUrl && isAudio) {
      episodes.push({
        id: guidMatch ? decodeXml(guidMatch[1]) : enclosureUrl,
        title: titleMatch ? decodeXml(titleMatch[1]) : "Episode",
        pubDate: pubDateMatch ? decodeXml(pubDateMatch[1]) : "",
        audioUrl: enclosureUrl,
        description: descMatch
          ? decodeXml(descMatch[1]).replace(/<[^>]*>/g, "").trim()
          : "",
        duration: durationMatch ? parseDuration(durationMatch[1]) : undefined,
        artwork: itunesImgMatch ? itunesImgMatch[1] : undefined,
      });
    }
  }

  return episodes;
}

export type PodcastChannelMeta = {
  name: string;
  author: string;
  description: string;
  artwork: string;
  webUrl: string;
  lastUpdated?: string;
};

export function parsePodcastChannelMeta(xml: string, feedUrl: string): PodcastChannelMeta {
  const firstItemIdx = xml.search(/<item[\s>]/i);
  const channelHeader = firstItemIdx >= 0 ? xml.slice(0, firstItemIdx) : xml;

  const titleMatch = channelHeader.match(/<title>([\s\S]*?)<\/title>/i);
  const authorMatch =
    channelHeader.match(/<itunes:author>([\s\S]*?)<\/itunes:author>/i) ||
    channelHeader.match(/<author>([\s\S]*?)<\/author>/i) ||
    channelHeader.match(/<itunes:name>([\s\S]*?)<\/itunes:name>/i);
  const descMatch =
    channelHeader.match(/<description>([\s\S]*?)<\/description>/i) ||
    channelHeader.match(/<itunes:summary>([\s\S]*?)<\/itunes:summary>/i);
  const itunesImgMatch =
    channelHeader.match(/<itunes:image[^>]+href=["']([^"']+)["']/i) ||
    channelHeader.match(/<image>[\s\S]*?<url>([\s\S]*?)<\/url>[\s\S]*?<\/image>/i);
  const linkMatch = channelHeader.match(/<link>([\s\S]*?)<\/link>/i);
  const firstPubDateMatch = xml.match(/<item[\s>][\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>/i);

  const name = titleMatch ? decodeXml(titleMatch[1]) : "";
  const author = authorMatch ? decodeXml(authorMatch[1]) : "";
  const description = descMatch
    ? decodeXml(descMatch[1]).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
    : "";
  const artwork = itunesImgMatch ? decodeXml(itunesImgMatch[1]) : "";
  const webUrl = linkMatch ? decodeXml(linkMatch[1]) : feedUrl;
  const lastUpdated = firstPubDateMatch ? decodeXml(firstPubDateMatch[1]) : undefined;

  return {
    name: name || feedUrl,
    author: author || name || "Podcast",
    description,
    artwork,
    webUrl: /^https?:\/\//i.test(webUrl) ? webUrl : feedUrl,
    ...(lastUpdated ? { lastUpdated } : {}),
  };
}

export async function fetchPodcastShowFromRss(
  feedUrl: string,
  overrides: Partial<CustomPodcastSpec> = {},
  signal?: AbortSignal,
): Promise<CustomPodcastSpec> {
  const cleanFeed = feedUrl.trim();
  const url = resolveFeedUrl(cleanFeed);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Podcast feed failed: ${res.status}`);
  const xml = await res.text();
  const meta = parsePodcastChannelMeta(xml, cleanFeed);
  const name = overrides.name?.trim() || meta.name;
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "show";
  return {
    id: overrides.id?.trim() || `custom-pod-${slug}-${hashString(cleanFeed).toString(36)}`,
    name,
    author: overrides.author?.trim() || meta.author,
    description: overrides.description?.trim() || meta.description,
    artwork: overrides.artwork?.trim() || meta.artwork,
    feedUrl: cleanFeed,
    webUrl: overrides.webUrl?.trim() || meta.webUrl,
    ...(overrides.supportUrl?.trim() ? { supportUrl: overrides.supportUrl.trim() } : {}),
    ...(meta.lastUpdated ? { lastUpdated: meta.lastUpdated } : {}),
    isCustom: true,
  };
}

export function resolveFeedUrl(url: string): string {
  if (Platform.OS === "web") {
    return `${new URL("/feed-proxy", SHARE_HUB_URL).href}?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export async function fetchFeedEpisodes(
  feedUrl: string,
  signal?: AbortSignal,
  limit: number = 30,
): Promise<PodcastEpisode[]> {
  const url = resolveFeedUrl(feedUrl);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Podcast feed failed: ${res.status}`);
  const xml = await res.text();
  return parsePodcastRss(xml, limit);
}

function createPodcastShow(data: Omit<PodcastShow, "fetchEpisodes">): PodcastShow {
  const show: PodcastShow = {
    ...data,
    fetchEpisodes: async (signal) => {
      const episodes = await fetchFeedEpisodes(data.feedUrl, signal);
      if (episodes.length > 0 && episodes[0].pubDate) {
        show.lastUpdated = episodes[0].pubDate;
      }
      return episodes;
    },
  };
  return show;
}

export function specToPodcastShow(spec: CustomPodcastSpec): PodcastShow {
  return createPodcastShow({
    id: spec.id,
    name: spec.name,
    author: spec.author?.trim() || spec.name,
    description: spec.description?.trim() || "",
    artwork: spec.artwork?.trim() || "",
    feedUrl: spec.feedUrl,
    webUrl: spec.webUrl?.trim() || spec.feedUrl,
    ...(spec.supportUrl?.trim() ? { supportUrl: spec.supportUrl.trim() } : {}),
    ...(spec.lastUpdated ? { lastUpdated: spec.lastUpdated } : {}),
    ...(spec.isCustom ? { isCustom: true } : {}),
  });
}

// Migrated reference catalog of curated independent podcast shows
export const PODCAST_SHOWS: PodcastShow[] = MIGRATED_PODCAST_SPECS.map(specToPodcastShow);
const byId = (id: string) => PODCAST_SHOWS.find((s) => s.id === id)!;

export const COLONIAL_OUTCASTS: PodcastShow = byId("colonial-outcasts");
export const BLACK_AUTONOMY: PodcastShow = byId("black-autonomy");
export const EVERYTHING_COOP: PodcastShow = byId("everything-coop");
export const UPSTREAM: PodcastShow = byId("upstream");
export const MAKC: PodcastShow = byId("millennials-killing-capitalism");
export const SRSLY_WRONG: PodcastShow = byId("srsly-wrong");
export const WORKING_CLASS_HISTORY: PodcastShow = byId("working-class-history");
export const LABOR_HISTORY_TODAY: PodcastShow = byId("labor-history-today");
export const NATIVE_ROOTS_RADIO: PodcastShow = byId("native-roots-radio");

let cachedPodcastSpecRef: CustomPodcastSpec[] | null = null;
let cachedCustomPodcasts: PodcastShow[] = [];

export function getCustomPodcastShows(): PodcastShow[] {
  const specs = getCurationConfig().podcasts;
  if (cachedPodcastSpecRef === specs) return cachedCustomPodcasts;
  cachedPodcastSpecRef = specs;
  cachedCustomPodcasts = specs.map((spec) =>
    specToPodcastShow({ ...spec, isCustom: true }),
  );
  return cachedCustomPodcasts;
}

export function useCustomPodcastShows(): PodcastShow[] {
  const { podcasts } = useCurationConfig();
  return useMemo(
    () => podcasts.map((spec) => specToPodcastShow({ ...spec, isCustom: true })),
    [podcasts],
  );
}

type CastopodPodcast = {
  id: string | number;
  podcastGuid?: string;
  title: string;
  author?: string;
  description?: string;
  artwork: string;
  feedUrl: string;
  webUrl?: string;
  lastUpdated?: string;
};

const DISCOVERED_PODCASTS = new Map<string, PodcastShow>();

export function castopodPodcastToShow(item: CastopodPodcast): PodcastShow {
  const stableId = item.podcastGuid || String(item.id);
  const show = createPodcastShow({
    id: `pod-${stableId}`,
    name: item.title,
    author: item.author || item.title,
    description: item.description || "",
    artwork: item.artwork,
    feedUrl: item.feedUrl,
    webUrl: item.webUrl || item.feedUrl,
    lastUpdated: item.lastUpdated,
  });
  DISCOVERED_PODCASTS.set(show.id, show);
  return show;
}

export async function fetchDiscoveredPodcasts(
  limit: number = 12,
  signal?: AbortSignal,
): Promise<PodcastShow[]> {
  const filters = getContentFilters();
  const endpoint = new URL("/api/podcasts", SHARE_HUB_URL);
  endpoint.searchParams.set("limit", String(limit));
  if (filters.podcastDiscoveryTerms.length > 0) {
    endpoint.searchParams.set("terms", filters.podcastDiscoveryTerms.join(","));
  }
  const response = await fetch(endpoint.toString(), { signal });
  if (!response.ok) {
    throw new Error(`Castopod Index discovery failed: ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.podcasts)) {
    throw new Error("Castopod Index returned an invalid podcast catalog.");
  }

  return payload.podcasts
    .filter((item: CastopodPodcast) => {
      if (
        !item ||
        typeof item.title !== "string" ||
        !Boolean(item.podcastGuid || item.id) ||
        typeof item.feedUrl !== "string" ||
        !/^https?:\/\//i.test(item.feedUrl) ||
        !isQualityArtwork(item.artwork) ||
        isExcludedContent([item.title, item.author], [], filters)
      ) {
        return false;
      }
      if (filters.podcastDiscoveryTerms.length > 0) {
        const searchable = [item.title, item.author, item.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return filters.podcastDiscoveryTerms.some((term) => searchable.includes(term));
      }
      return true;
    })
    .map(castopodPodcastToShow);
}

export function queryDiscoveredPodcasts(limit: number = 12) {
  const filters = getContentFilters();
  return queryOptions({
    queryKey: [
      "castopodPodcasts",
      limit,
      filters.podcastDiscoveryTerms.join(","),
      filters.excludedTerms.join(","),
      filters.excludedPatterns.join(","),
      filters.excludeCommercialFormatNames,
    ],
    queryFn: ({ signal }) => fetchDiscoveredPodcasts(limit, signal),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

export function findPodcastShow(id: string | undefined): PodcastShow | undefined {
  if (!id) return undefined;
  return (
    getCustomPodcastShows().find((show) => show.id === id) ||
    DISCOVERED_PODCASTS.get(id) ||
    PODCAST_SHOWS.find((show) => show.id === id)
  );
}

export async function fetchPodcastShowById(
  id: string,
  signal?: AbortSignal,
): Promise<PodcastShow | undefined> {
  const existing = findPodcastShow(id);
  if (existing) return existing;

  if (id.startsWith("pod-")) {
    const rawId = id.slice(4);
    try {
      const endpoint = new URL("/api/podcasts", SHARE_HUB_URL);
      endpoint.searchParams.set("id", rawId);
      const res = await fetch(endpoint.toString(), { signal });
      if (res.ok) {
        const payload = await res.json();
        const item = Array.isArray(payload?.podcasts) ? payload.podcasts[0] : null;
        if (
          item &&
          typeof item.title === "string" &&
          typeof item.feedUrl === "string" &&
          /^https?:\/\//i.test(item.feedUrl) &&
          isQualityArtwork(item.artwork)
        ) {
          return castopodPodcastToShow(item);
        }
      }
    } catch {
      // Fall through to iTunes lookup
    }

    if (/^\d+$/.test(rawId)) {
      try {
        const res = await fetch(
          `https://itunes.apple.com/lookup?id=${encodeURIComponent(rawId)}`,
          { signal },
        );
        if (res.ok) {
          const data = await res.json();
          const item = Array.isArray(data?.results) ? data.results[0] : null;
          if (
            item &&
            typeof item.collectionName === "string" &&
            typeof item.feedUrl === "string" &&
            /^https?:\/\//i.test(item.feedUrl) &&
            isQualityArtwork(item.artworkUrl600 || item.artworkUrl100)
          ) {
            const show = createPodcastShow({
              id,
              name: item.collectionName,
              author: item.artistName || item.collectionName,
              description: item.genres?.join(", ") || "",
              artwork: item.artworkUrl600 || item.artworkUrl100,
              feedUrl: item.feedUrl,
              webUrl: item.collectionViewUrl || item.feedUrl,
            });
            DISCOVERED_PODCASTS.set(id, show);
            return show;
          }
        }
      } catch {
        // Return undefined if network lookup fails
      }
    }
  }

  return undefined;
}

export function queryPodcastShow(id: string | undefined) {
  return queryOptions({
    queryKey: ["podcastShow", id],
    queryFn: ({ signal }) => (id ? fetchPodcastShowById(id, signal) : Promise.resolve(undefined)),
    enabled: Boolean(id),
    staleTime: 60 * 60 * 1000,
    initialData: () => findPodcastShow(id),
  });
}

/**
 * Safely parses a date string into an epoch timestamp in milliseconds.
 */
export function parseDateTimestamp(dateStr: string | undefined): number {
  if (!dateStr || typeof dateStr !== "string") return 0;
  const time = new Date(dateStr).getTime();
  return isNaN(time) ? 0 : time;
}

/**
 * Sorts podcast and discussion shows by their last update date (newest first).
 */
export function sortDiscussionsByLastUpdate(shows: PodcastShow[]): PodcastShow[] {
  return [...shows].sort((a, b) => {
    const timeA = parseDateTimestamp(a.lastUpdated);
    const timeB = parseDateTimestamp(b.lastUpdated);
    return timeB - timeA;
  });
}

export function queryPodcastEpisodes(show: PodcastShow | undefined) {
  return queryOptions({
    queryKey: ["podcastEpisodes", show?.id],
    queryFn: ({ signal }) => show!.fetchEpisodes(signal),
    enabled: Boolean(show),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Fetches the latest published date from each podcast RSS feed in the background.
 */
export function queryDiscussionLatestDates(shows: PodcastShow[]) {
  const showKey = shows.map((s) => s.id).join(",");
  return queryOptions({
    queryKey: ["discussionLatestDates", showKey],
    queryFn: async ({ signal }) => {
      const dates: Record<string, string> = {};
      await Promise.allSettled(
        shows.map(async (show) => {
          try {
            const url = resolveFeedUrl(show.feedUrl);
            const res = await fetch(url, { signal });
            if (!res.ok) return;
            const xml = await res.text();
            const firstItem = xml.match(/<item>([\s\S]*?)<\/item>/i);
            if (firstItem) {
              const pubDate = firstItem[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
              if (pubDate) {
                dates[show.id] = decodeXml(pubDate[1]);
              }
            }
          } catch {
            // Keep seed timestamp if feed fetch fails
          }
        }),
      );
      return dates;
    },
    enabled: shows.length > 0,
    staleTime: 15 * 60 * 1000,
  });
}

export function episodeTrack(
  episode: PodcastEpisode,
  show: PodcastShow,
  index: number = 0,
): RNTrack {
  const artwork = episode.artwork || show.artwork;
  const isExternalStream = episode.audioUrl.includes("/stream/external/");
  const headers = isExternalStream
    ? {
        "mirlo-api-key": API_KEY,
        "social-music-userid": getListenerUserIdSync(),
      }
    : {};

  return {
    id: -(Math.abs(hashString(episode.id)) || 100000 + index),
    title: episode.title,
    artist: show.author,
    artwork,
    url: episode.audioUrl,
    headers,
    type: "default" as TrackType,
    duration: episode.duration,
    order: index + 1,
    queueIndex: index,
    allowIndividualSale: false,
    isPreview: false,
    audio: {
      url: episode.audioUrl,
      duration: episode.duration,
    },
    trackGroupId: 0,
    trackGroup: {
      id: 0,
      trackGroupId: 0,
      title: show.name,
      artistId: 0,
      urlSlug: show.id,
      releaseDate: episode.pubDate,
      artist: {
        name: show.author,
        bio: show.description,
      },
      cover: { sizes: coverSizes(artwork) },
    },
    podcastId: show.id,
    podcastEpisodeId: episode.id,
  } as RNTrack;
}

export async function searchPodcastShows(
  term: string,
  signal?: AbortSignal,
): Promise<PodcastShow[]> {
  const query = term.trim().toLowerCase();
  if (!query) return [];

  const filters = getContentFilters();
  const customMatches = getCustomPodcastShows().filter(
    (s) =>
      s.name.toLowerCase().includes(query) ||
      s.author.toLowerCase().includes(query) ||
      s.description.toLowerCase().includes(query),
  );

  const cachedMatches = [...DISCOVERED_PODCASTS.values()].filter(
    (s) =>
      s.name.toLowerCase().includes(query) ||
      s.author.toLowerCase().includes(query) ||
      s.description.toLowerCase().includes(query),
  );

  let remoteShows: PodcastShow[] = [];
  try {
    const endpoint = `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(query)}&limit=15`;
    const res = await fetch(endpoint, { signal });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.results)) {
        remoteShows = data.results
          .filter(
            (item: any) =>
              item &&
              typeof item.collectionName === "string" &&
              typeof item.feedUrl === "string" &&
              /^https?:\/\//i.test(item.feedUrl) &&
              isQualityArtwork(item.artworkUrl600 || item.artworkUrl100) &&
              !isExcludedContent([item.collectionName, item.artistName], [], filters),
          )
          .map((item: any) => {
            const id = `pod-${item.collectionId}`;
            const show = createPodcastShow({
              id,
              name: item.collectionName,
              author: item.artistName || item.collectionName,
              description: item.genres?.join(", ") || "",
              artwork: item.artworkUrl600 || item.artworkUrl100,
              feedUrl: item.feedUrl,
              webUrl: item.collectionViewUrl || item.feedUrl,
            });
            DISCOVERED_PODCASTS.set(id, show);
            return show;
          });
      }
    }
  } catch {
    // Return custom and cached matches if remote search fails
  }

  const seen = new Set<string>();
  return [...customMatches, ...cachedMatches, ...remoteShows].filter((show) => {
    if (isExcludedContent([show.name, show.author], [], filters)) return false;
    const key = show.id.toLowerCase();
    const feedKey = (show.feedUrl || "").toLowerCase();
    if (seen.has(key) || (feedKey && seen.has(feedKey))) return false;
    seen.add(key);
    if (feedKey) seen.add(feedKey);
    return true;
  });
}
