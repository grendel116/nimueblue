import { Platform } from "react-native";
import { queryOptions } from "@tanstack/react-query";
import type { TrackType } from "react-native-track-player";
import { coverSizes, isQualityArtwork } from "@/scripts/utils";
import { API_KEY } from "@/constants/api-key";
import { getListenerUserIdSync } from "@/scripts/listenerIdentity";
import { SHARE_HUB_URL } from "@/queries/shareHub";

// Podcast and talk shows shown under Discussion on Home. Episodes are parsed from
// standard open podcast RSS feeds with direct audio enclosures.

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
  fetchEpisodes: (signal?: AbortSignal) => Promise<PodcastEpisode[]>;
};

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#8216": "'",
  "#8217": "'",
  "#8220": '"',
  "#8221": '"',
  "#8211": "–",
  "#8212": "—",
  "#8230": "…",
};

export function decodeXml(text: string): string {
  if (!text) return "";
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#\d+|[a-z]+);/gi, (match, entity: string) => {
      const code = entity.toLowerCase();
      if (XML_ENTITIES[code]) return XML_ENTITIES[code];
      if (code.startsWith("#")) {
        const num = Number(code.slice(1));
        return !isNaN(num) ? String.fromCharCode(num) : match;
      }
      return match;
    })
    .trim();
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

export const COLONIAL_OUTCASTS: PodcastShow = createPodcastShow({
  id: "colonial-outcasts",
  name: "Colonial Outcasts",
  author: "Greg Stoker & Mark Wayne",
  description:
    "Anti-imperialist, anti-war, and anti-establishment podcast digging into history, anthropology, geopolitics, and military science.",
  artwork:
    "https://substackcdn.com/image/fetch/w_600,c_limit,f_auto,q_auto:good/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fce66ed85-78f8-46e1-bfc9-e0c267d7e708_3000x3000.png",
  feedUrl: "https://www.rfemedia.com/feed?section=colonial-outcasts",
  webUrl: "https://www.rfemedia.com/s/colonial-outcasts",
  supportUrl: "https://www.rfemedia.com/subscribe",
  lastUpdated: "2026-10-12T19:33:30Z",
});

export const BLACK_AUTONOMY: PodcastShow = createPodcastShow({
  id: "black-autonomy",
  name: "Black Autonomy Podcast",
  author: "Lorenzo Kom'boa Ervin & JoNina Abron-Ervin",
  description:
    "Discussions on anarchism and the revolutionary ideals of Black autonomy and liberation, hosted by veteran organizers and former Black Panther Party members Lorenzo Kom'boa Ervin and JoNina Abron-Ervin.",
  artwork:
    "https://static.libsyn.com/p/assets/8/4/7/9/847958a34c0d9a21/Black-Autonomy-Profile_100.png",
  feedUrl: "https://blackautonomy.libsyn.com/rss",
  webUrl: "https://blackautonomy.libsyn.com",
  supportUrl: "https://www.patreon.com/blackautonomy",
  lastUpdated: "2026-06-07T23:52:00Z",
});

export const EVERYTHING_COOP: PodcastShow = createPodcastShow({
  id: "everything-coop",
  name: "Everything Co-op",
  author: "Vernon Oakes",
  description:
    "Weekly conversations exploring the cooperative movement, worker-owned businesses, and community wealth building through an economic democracy lens.",
  artwork: "https://i1.sndcdn.com/avatars-MBD0zlDPR5XKKza6-lLoRig-original.jpg",
  feedUrl: "https://feeds.soundcloud.com/users/soundcloud:users:381264350/sounds.rss",
  webUrl: "https://everything.coop",
  supportUrl: "https://everything.coop",
  lastUpdated: "2026-10-08T06:17:21Z",
});

export const UPSTREAM: PodcastShow = createPodcastShow({
  id: "upstream",
  name: "Upstream Podcast",
  author: "Della Z. Duncan & Robert R. Raymond",
  description:
    "Challenging traditional economic assumptions through documentary and conversation, exploring worker cooperatives, degrowth, solidarity economics, and democratic alternatives.",
  artwork:
    "https://static.libsyn.com/p/assets/c/7/e/1/c7e178673bac87a2d959afa2a1bf1c87/avatars-000421042564-bh1xd1-original.jpg",
  feedUrl: "https://rss.libsyn.com/shows/435210/destinations/3632352.xml",
  webUrl: "https://www.upstreampodcast.org",
  supportUrl: "https://www.patreon.com/upstreampodcast",
  lastUpdated: "2026-10-12T15:00:00Z",
});

export const MAKC: PodcastShow = createPodcastShow({
  id: "millennials-killing-capitalism",
  name: "Millennials Are Killing Capitalism",
  author: "MAKC Collective",
  description:
    "Conversations on radical movement building, abolition, anti-colonialism, revolutionary theory, and working-class liberation.",
  artwork:
    "https://static.libsyn.com/p/assets/3/7/e/4/37e4287a44a8f68116c3140a3186d450/MAKC-New-3.png",
  feedUrl: "https://millennialsarekillingcapitalism.libsyn.com/rss",
  webUrl: "https://millennialsarekillingcapitalism.com",
  supportUrl: "https://www.patreon.com/millennialsarekillingcapitalism",
  lastUpdated: "2026-10-13T14:03:00Z",
});

export const SRSLY_WRONG: PodcastShow = createPodcastShow({
  id: "srsly-wrong",
  name: "Srsly Wrong",
  author: "Shawn Vulliez & Aaron Moritz",
  description:
    "Utopian comedy and educational podcast exploring Library Socialism, social ecology, anti-capitalism, and building a post-scarcity, free society.",
  artwork:
    "https://srslywrong.com/wp-content/uploads/2026/08/369-groceries-scaled.png",
  feedUrl: "https://srslywrong.com/feed/",
  webUrl: "https://srslywrong.com",
  supportUrl: "https://www.patreon.com/srslywrong",
  lastUpdated: "2026-08-22T19:09:14Z",
});

export const WORKING_CLASS_HISTORY: PodcastShow = createPodcastShow({
  id: "working-class-history",
  name: "Working Class History",
  author: "Working Class History",
  description:
    "Audio documentaries hearing from ordinary people who have helped make history, uncovering grassroots labor struggles, strikes, uprisings, and social movements worldwide.",
  artwork:
    "https://d3wo5wojvuv7l.cloudfront.net/t_rss_itunes_square_1400/images.spreaker.com/original/c25d55a3135a63530c92fbf1236277b0.jpg",
  feedUrl: "https://www.spreaker.com/show/5711490/episodes/feed",
  webUrl: "https://workingclasshistory.com",
  supportUrl: "https://patreon.com/workingclasshistory",
  lastUpdated: "2026-09-30T15:54:14Z",
});

export const LABOR_HISTORY_TODAY: PodcastShow = createPodcastShow({
  id: "labor-history-today",
  name: "Labor History Today",
  author: "Labor History Today",
  description:
    "Gripping stories of historic battles for worker rights, union campaigns, and the lessons they offer for today's labor struggles.",
  artwork:
    "https://pbcdn1.podbean.com/imglogo/image-logo/8144168/Labor_History_Today_podcast_cover-new_771ff.png",
  feedUrl: "https://feed.podbean.com/laborhistorytoday/feed.xml",
  webUrl: "https://www.laborhistorytoday.info",
  supportUrl: "https://www.patreon.com/LaborHistoryToday",
  lastUpdated: "2026-10-10T12:00:00Z",
});

export const NATIVE_ROOTS_RADIO: PodcastShow = createPodcastShow({
  id: "native-roots-radio",
  name: "Native Roots Radio",
  author: "Robert Pilot",
  description:
    "Native American talk radio and discussions hosted by Robert Pilot, presenting national and local Indigenous news, treaty rights, environmental justice, and tribal affairs.",
  artwork:
    "https://is1-ssl.mzstatic.com/image/thumb/Podcasts125/v4/24/cd/27/24cd27ee-ee40-70a4-f20a-6260831fcb2c/mza_15228667069575138186.jpg/600x600bb.jpg",
  feedUrl: "https://www.am950radio.com/category/podcasts/im-awake/feed/",
  webUrl: "https://nativerootsradio.com",
  supportUrl: "https://nativerootsradio.com",
  lastUpdated: "2026-10-15T22:56:00Z",
});

export const PODCAST_SHOWS: PodcastShow[] = [
  UPSTREAM,
  WORKING_CLASS_HISTORY,
  EVERYTHING_COOP,
  NATIVE_ROOTS_RADIO,
  LABOR_HISTORY_TODAY,
  MAKC,
  SRSLY_WRONG,
  COLONIAL_OUTCASTS,
  BLACK_AUTONOMY,
];

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
  limit: number = 6,
  signal?: AbortSignal,
): Promise<PodcastShow[]> {
  const endpoint = new URL("/api/podcasts", SHARE_HUB_URL);
  endpoint.searchParams.set("limit", String(limit));
  const response = await fetch(endpoint.toString(), { signal });
  if (!response.ok) {
    throw new Error(`Castopod Index discovery failed: ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.podcasts)) {
    throw new Error("Castopod Index returned an invalid podcast catalog.");
  }

  return payload.podcasts
    .filter(
      (item: CastopodPodcast) =>
        item &&
        typeof item.title === "string" &&
        Boolean(item.podcastGuid || item.id) &&
        typeof item.feedUrl === "string" &&
        /^https?:\/\//i.test(item.feedUrl) &&
        isQualityArtwork(item.artwork),
    )
    .map(castopodPodcastToShow);
}

export function queryDiscoveredPodcasts(limit: number = 6) {
  return queryOptions({
    queryKey: ["castopodPodcasts", limit],
    queryFn: ({ signal }) => fetchDiscoveredPodcasts(limit, signal),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

export function findPodcastShow(id: string | undefined): PodcastShow | undefined {
  if (!id) return undefined;
  return PODCAST_SHOWS.find((show) => show.id === id) || DISCOVERED_PODCASTS.get(id);
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

  const curatedMatches = PODCAST_SHOWS.filter(
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
              isQualityArtwork(item.artworkUrl600 || item.artworkUrl100),
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
    // Return curated and cached matches if remote search fails
  }

  const seen = new Set<string>();
  return [...curatedMatches, ...cachedMatches, ...remoteShows].filter((show) => {
    const key = show.id.toLowerCase();
    const feedKey = (show.feedUrl || "").toLowerCase();
    if (seen.has(key) || (feedKey && seen.has(feedKey))) return false;
    seen.add(key);
    if (feedKey) seen.add(feedKey);
    return true;
  });
}

