import { useMemo } from "react";
import { queryOptions } from "@tanstack/react-query";
import { audioTrackType, decodeHtmlEntities, isQualityArtwork } from "@/scripts/utils";
import { API_KEY } from "@/constants/api-key";
import { getListenerUserIdSync } from "@/scripts/listenerIdentity";
import {
  ContentFilters,
  CustomStationSpec,
  MIGRATED_EXCLUDED_COUNTRIES,
  MIGRATED_EXCLUDED_COUNTRY_CODES,
  MIGRATED_RADICAL_RADIO_TAGS,
  MIGRATED_STATION_SPECS,
  getContentFilters,
  getCurationConfig,
  isExcludedContent,
  isExcludedCountry,
  useCurationConfig,
} from "@/queries/excludedContent";
// A station plays as a 10-minute set in the queue, then playback moves on to what's next
import { RADIO_SET_SECONDS } from "@/scripts/radioTimer";

// Radio stations shown on Home and in Search. The base app uses open Radio-Browser discovery
// and user-added custom stations stored client-side; migrated curated stations live in
// MIGRATED_STATION_SPECS and RADIO_STATIONS for preset import and deep-link resolution.

export type RadioPlay = {
  key: string;
  song: string;
  artist: string;
  airdate: string;
  artwork: string;
};

export type RadioStation = {
  id: string;
  name: string;
  liveName: string;
  location: string;
  artwork: string;
  // A line or two for the station screen's About section
  about: string;
  streamUrl: string;
  playlistPage: string;
  donatePage: string;
  nowPlayingUrl?: string;
  tags?: string[];
  isCustom?: boolean;
  headers?: Record<string, string>;
  fetchPlays: (signal: AbortSignal) => Promise<RadioPlay[]>;
};

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json();
}

function toArtworkUrl(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && typeof (raw as { url?: unknown }).url === "string") {
    return (raw as { url: string }).url;
  }
  return "";
}

type KexpPlay = {
  id: number;
  airdate: string;
  play_type: string;
  song: string;
  artist: string;
  thumbnail_uri: string;
  image_uri: string;
};

type PublicRadioSong = {
  song_id: number;
  title: string;
  artist: string;
  played_at: string;
  art_url: string | null;
};

type WfmuNow = {
  program: { id: string; title_html: string | null };
  episode: { id: number };
  segment: {
    id: number;
    title_html: string | null;
    artist_html: string | null;
    set_break_flag: boolean;
    image: string | { url?: string | null } | null;
  };
};

type RadioCoStatus = {
  current_track: { title: string; start_time: string; artwork_url: string };
};

type ZenoNowPlaying = {
  title?: string | null;
  artist?: string | null;
  thumb?: string | null;
};

export async function fetchPlaysFromNowPlayingUrl(
  url: string,
  fallbackArtist: string,
  fallbackArtwork: string,
  signal: AbortSignal,
): Promise<RadioPlay[]> {
  if (!url) return [];
  const data = await getJson<any>(url, signal);
  if (!data || typeof data !== "object") return [];

  // KEXP v2 API: { results: KexpPlay[] }
  if (Array.isArray(data.results)) {
    const track = (data.results as KexpPlay[]).find((p) => p.play_type === "trackplay");
    if (!track) return [];
    return [
      {
        key: String(track.id),
        song: track.song,
        artist: track.artist,
        airdate: track.airdate,
        artwork: toArtworkUrl(track.image_uri) || toArtworkUrl(track.thumbnail_uri) || fallbackArtwork,
      },
    ];
  }

  // Public Radio (MPR / Carbon Sound) API: { data: { songs: PublicRadioSong[] } }
  if (Array.isArray(data.data?.songs)) {
    const song = data.data.songs[0] as PublicRadioSong | undefined;
    if (!song) return [];
    return [
      {
        key: `${song.song_id}-${song.played_at}`,
        song: song.title,
        artist: song.artist,
        airdate: song.played_at,
        artwork: toArtworkUrl(song.art_url) || fallbackArtwork,
      },
    ];
  }

  // WFMU live show API: { program, episode, segment }
  if (data.program && data.segment) {
    const { program, episode, segment } = data as WfmuNow;
    const now = new Date().toISOString();
    if (segment.id && !segment.set_break_flag && segment.title_html) {
      return [
        {
          key: String(segment.id),
          song: decodeHtmlEntities(segment.title_html),
          artist: decodeHtmlEntities(segment.artist_html ?? ""),
          airdate: now,
          artwork: toArtworkUrl(segment.image) || fallbackArtwork,
        },
      ];
    }
    if (!program.title_html) return [];
    return [
      {
        key: `show-${program.id}-${episode.id}`,
        song: decodeHtmlEntities(program.title_html),
        artist: fallbackArtist,
        airdate: now,
        artwork: fallbackArtwork,
      },
    ];
  }

  // Radio.co status API: { current_track: { title, start_time, artwork_url } }
  if (data.current_track && typeof data.current_track.title === "string") {
    const show = (data as RadioCoStatus).current_track;
    const [title, ...hosts] = show.title.split(" - ");
    return [
      {
        key: `${show.start_time}-${show.title}`,
        song: title,
        artist: hosts.join(" - ") || fallbackArtist,
        airdate: show.start_time,
        artwork: toArtworkUrl(show.artwork_url) || fallbackArtwork,
      },
    ];
  }

  // Zeno.fm / generic flat JSON status: { title / song, artist, thumb / artwork }
  const rawRawTitle = typeof data.song === "string" ? data.song : (data as ZenoNowPlaying).title;
  const rawTitle = decodeHtmlEntities(rawRawTitle ?? "").trim();
  if (!rawTitle) return [];
  const rawArtist = decodeHtmlEntities(
    typeof data.artist === "string" ? data.artist : "",
  ).trim();
  const separator = rawArtist ? -1 : rawTitle.lastIndexOf(" - ");
  const song = separator > 0 ? rawTitle.slice(0, separator).trim() : rawTitle;
  const artist =
    rawArtist ||
    (separator > 0 ? rawTitle.slice(separator + 3).trim() : fallbackArtist);
  const rawThumb =
    toArtworkUrl(data.thumb) || toArtworkUrl(data.artwork) || toArtworkUrl(data.image);
  return [
    {
      key: `${song}-${artist}`,
      song,
      artist,
      airdate: typeof data.airdate === "string" && data.airdate ? data.airdate : new Date().toISOString(),
      artwork: isQualityArtwork(rawThumb) ? rawThumb.trim() : fallbackArtwork,
    },
  ];
}

export function specToRadioStation(spec: CustomStationSpec): RadioStation {
  const artwork = spec.artwork?.trim() || "";
  const location = spec.location?.trim() || "Autonomous / Global";
  const liveName = spec.liveName?.trim() || spec.name;
  const nowPlayingUrl = spec.nowPlayingUrl?.trim() || undefined;
  return {
    id: spec.id,
    name: spec.name,
    liveName,
    location,
    artwork,
    about: spec.about?.trim() || `${spec.name} — Radio broadcast from ${location}.`,
    streamUrl: spec.streamUrl,
    playlistPage: spec.playlistPage?.trim() || "",
    donatePage: spec.donatePage?.trim() || spec.playlistPage?.trim() || "",
    ...(nowPlayingUrl ? { nowPlayingUrl } : {}),
    ...(spec.tags && spec.tags.length > 0 ? { tags: spec.tags } : {}),
    ...(spec.isCustom ? { isCustom: true } : {}),
    fetchPlays: nowPlayingUrl
      ? (signal) => fetchPlaysFromNowPlayingUrl(nowPlayingUrl, spec.name, artwork, signal)
      : async () => [],
  };
}

// Migrated reference catalog of curated independent stations
export const RADIO_STATIONS: RadioStation[] = MIGRATED_STATION_SPECS.map(specToRadioStation);
const WORLDWIDE_FM = RADIO_STATIONS.find((s) => s.id === "worldwide-fm")!;

let cachedSpecRef: CustomStationSpec[] | null = null;
let cachedCustomStations: RadioStation[] = [];

export function getCustomRadioStations(): RadioStation[] {
  const specs = getCurationConfig().stations;
  if (cachedSpecRef === specs) return cachedCustomStations;
  cachedSpecRef = specs;
  cachedCustomStations = specs.map((spec) =>
    specToRadioStation({ ...spec, isCustom: true }),
  );
  return cachedCustomStations;
}

export function useCustomRadioStations(): RadioStation[] {
  const { stations } = useCurationConfig();
  return useMemo(
    () => stations.map((spec) => specToRadioStation({ ...spec, isCustom: true })),
    [stations],
  );
}

// Stream quality labels that tell copies of one station apart, such as "320k AAC", "FLAC+meta",
// and "192 MP3" in "Radio Paradise Main Mix 320k AAC"
const STREAM_QUALITY_LABEL =
  /\b(?:\d+\s*k(?:bps)?\b|(?:\d+\s*)?(?:flac|aac|acc|mp3|ogg|opus)\b)(?:\s*\+\s*meta\b)?/gi;

// Reduces a station name to its letters and digits, without stream quality labels, so every
// stream of one station shares a name
function normalizeStationName(name: string): string {
  return name
    .replace(STREAM_QUALITY_LABEL, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeStationUrl(rawUrl: string, includeQuery: boolean): string {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    const query = includeQuery ? url.search : "";
    return `${host}${path}${query}`;
  } catch {
    return "";
  }
}

export function deduplicateRadioStations(
  stations: RadioStation[],
  filtersOverride?: ContentFilters,
): RadioStation[] {
  const seenIdentities = new Set<string>();
  return stations.filter((station) => {
    if (
      (!station.isCustom && !isQualityArtwork(station.artwork)) ||
      isExcludedContent([station.name, station.liveName], station.tags ?? [], filtersOverride)
    ) {
      return false;
    }
    const identities = [
      `id:${station.id}`,
      `name-location:${normalizeStationName(station.name)}:${normalizeStationName(station.location)}`,
      `homepage:${normalizeStationUrl(station.playlistPage, false)}`,
      `stream:${normalizeStationUrl(station.streamUrl, true)}`,
    ].filter((identity) => !identity.endsWith(":"));

    if (identities.some((identity) => seenIdentities.has(identity))) {
      return false;
    }
    identities.forEach((identity) => seenIdentities.add(identity));
    return true;
  });
}

export type RadioBrowserStation = {
  changeuuid?: string;
  stationuuid: string;
  name: string;
  url: string;
  url_resolved?: string;
  homepage?: string;
  favicon?: string;
  tags?: string;
  country?: string;
  countrycode?: string;
  state?: string;
  language?: string;
  votes?: number;
  clicktimestamp?: string;
  codec?: string;
  bitrate?: number;
  lastcheckok?: number;
  ssl_error?: number;
};

export const EXCLUDED_COLONIAL_COUNTRIES = new Set(MIGRATED_EXCLUDED_COUNTRIES);
export const EXCLUDED_COLONIAL_COUNTRY_CODES = new Set(MIGRATED_EXCLUDED_COUNTRY_CODES);
export const RADICAL_RADIO_TAGS = MIGRATED_RADICAL_RADIO_TAGS;

export function isExcludedColonialStation(
  rb: RadioBrowserStation,
  filtersOverride?: ContentFilters,
): boolean {
  return isExcludedCountry(rb.country, rb.countrycode, rb.state, filtersOverride);
}

export function isPlayableRadioBrowserStation(
  rb: RadioBrowserStation,
  filtersOverride?: ContentFilters,
): boolean {
  if (isExcludedColonialStation(rb, filtersOverride)) return false;
  const name = rb.name || "";
  if (!name.trim()) return false;
  if (isExcludedContent([name], (rb.tags || "").split(","), filtersOverride)) return false;
  const stream = (rb.url_resolved || rb.url || "").trim();
  if (!stream) return false;
  // Must be a secure HTTPS stream to play reliably across Android, iOS, and Web
  if (!stream.toLowerCase().startsWith("https://")) return false;
  // Reject playlist files which are not direct playable audio streams
  if (/\.(pls|m3u|asx)(\?|$)/i.test(stream)) return false;
  // Radio-Browser verification: check status and SSL health
  if (rb.lastcheckok !== undefined && rb.lastcheckok !== 1) return false;
  if (rb.ssl_error !== undefined && rb.ssl_error !== 0) return false;
  // High-resolution artwork is required
  return isQualityArtwork(rb.favicon);
}

// Radio Browser asks every client to identify itself
const RADIO_BROWSER_HEADERS = { "User-Agent": "NimueBlue" };

export const DISCOVERED_STATIONS = new Map<string, RadioStation>();

export function registerDiscoveredStation(station: RadioStation) {
  DISCOVERED_STATIONS.set(station.id, station);
}

export function radioBrowserToRadioStation(rb: RadioBrowserStation): RadioStation {
  const cleanId = `rb-${rb.stationuuid.replace(/-/g, "").toLowerCase()}`;
  const location = [rb.state, rb.country].filter(Boolean).join(", ") || "Autonomous / Global";
  const name = rb.name?.trim() || "Independent Broadcast";
  const artwork = isQualityArtwork(rb.favicon) ? rb.favicon!.trim() : "";
  const rawTags = [
    ...(rb.tags ? rb.tags.split(",") : []),
    ...(rb.language ? rb.language.split(",") : []),
    rb.country || "",
    rb.state || "",
  ]
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const tags = rawTags.length > 0 ? Array.from(new Set(rawTags)) : undefined;

  const station: RadioStation = {
    id: cleanId,
    name,
    liveName: name,
    location,
    artwork,
    about: `${name} — Radio broadcast from ${location}.`,
    streamUrl: rb.url_resolved || rb.url,
    playlistPage: rb.homepage || "",
    donatePage: rb.homepage || "",
    ...(tags ? { tags } : {}),
    fetchPlays: async () => [],
  };
  registerDiscoveredStation(station);
  return station;
}

export async function fetchDiscoveredRadioStations(
  limit: number = 12,
  signal?: AbortSignal,
): Promise<RadioStation[]> {
  const filters = getContentFilters();
  const discoveryTags = filters.radioDiscoveryTags;

  let stationLists: RadioBrowserStation[][];

  if (discoveryTags.length === 0) {
    const endpoint = `https://de1.api.radio-browser.info/json/stations?order=clicktimestamp&reverse=true&hidebroken=true&limit=${limit * 4}`;
    const res = await fetch(endpoint, {
      headers: RADIO_BROWSER_HEADERS,
      signal,
    });
    if (!res.ok) throw new Error(`Radio-Browser discovery failed: ${res.status}`);
    const data: RadioBrowserStation[] = await res.json();
    if (!Array.isArray(data)) {
      throw new Error("Radio-Browser returned an invalid station list.");
    }
    stationLists = [data];
  } else {
    const results = await Promise.allSettled(
      discoveryTags.map(async (tag) => {
        const endpoint = `https://de1.api.radio-browser.info/json/stations/bytag/${encodeURIComponent(tag)}?order=clicktimestamp&reverse=true&hidebroken=true&limit=${limit * 3}`;
        const res = await fetch(endpoint, {
          headers: RADIO_BROWSER_HEADERS,
          signal,
        });
        if (!res.ok) throw new Error(`Radio-Browser tag search failed (${tag}): ${res.status}`);
        const data: RadioBrowserStation[] = await res.json();
        if (!Array.isArray(data)) {
          throw new Error(`Radio-Browser returned an invalid station list for tag: ${tag}`);
        }
        return data;
      }),
    );

    if (signal?.aborted) throw signal.reason;

    stationLists = results.flatMap((result, index) => {
      if (result.status === "fulfilled") return [result.value];
      console.warn(`Radio-Browser tag search failed (${discoveryTags[index]}):`, result.reason);
      return [];
    });
    if (stationLists.length === 0) {
      throw new Error("All Radio-Browser tag searches failed.");
    }
  }

  const stationsById = new Map<string, RadioBrowserStation>();
  stationLists
    .flat()
    .sort((a, b) => {
      const aTime = Date.parse(a.clicktimestamp || "");
      const bTime = Date.parse(b.clicktimestamp || "");
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    })
    .forEach((station) => {
      if (station.stationuuid && !stationsById.has(station.stationuuid)) {
        stationsById.set(station.stationuuid, station);
      }
    });

  return [...stationsById.values()]
    .filter((rb) => isPlayableRadioBrowserStation(rb, filters))
    .slice(0, limit)
    .map(radioBrowserToRadioStation);
}

export function queryDiscoveredRadioStations(limit: number = 12) {
  const filters = getContentFilters();
  return queryOptions({
    queryKey: [
      "discoveredRadioStations",
      limit,
      filters.radioDiscoveryTags.join(","),
      filters.excludedCountries.join(","),
      filters.excludedTerms.join(","),
      filters.excludedPatterns.join(","),
      filters.excludeCommercialFormatNames,
    ],
    queryFn: ({ signal }) => fetchDiscoveredRadioStations(limit, signal),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

export function findStation(id: string | undefined): RadioStation | undefined {
  if (!id) return undefined;
  const custom = getCustomRadioStations();
  if (id === "worldwide-fm" || id === "rb-1651c32f55d84429995d872ea0dcf520") {
    return custom.find((s) => s.id === "worldwide-fm") || WORLDWIDE_FM;
  }
  return (
    custom.find((s) => s.id === id) ||
    DISCOVERED_STATIONS.get(id) ||
    RADIO_STATIONS.find((s) => s.id === id)
  );
}

export async function fetchRadioStationById(
  id: string,
  signal?: AbortSignal,
): Promise<RadioStation | undefined> {
  const existing = findStation(id);
  if (existing) return existing;

  if (id.startsWith("rb-")) {
    const rawUuid = id.replace(/^rb-/, "");
    const uuid = rawUuid.replace(
      /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i,
      "$1-$2-$3-$4-$5",
    );
    try {
      const endpoint = `https://de1.api.radio-browser.info/json/stations/byuuid/${encodeURIComponent(uuid)}`;
      const res = await fetch(endpoint, {
        headers: RADIO_BROWSER_HEADERS,
        signal,
      });
      if (res.ok) {
        const data: RadioBrowserStation[] = await res.json();
        if (Array.isArray(data) && data.length > 0 && isPlayableRadioBrowserStation(data[0])) {
          return radioBrowserToRadioStation(data[0]);
        }
      }
    } catch {
      // Return undefined if network lookup fails
    }
  }

  return undefined;
}

export function queryRadioStation(id: string | undefined) {
  return queryOptions({
    queryKey: ["radioStation", id],
    queryFn: ({ signal }) => (id ? fetchRadioStationById(id, signal) : Promise.resolve(undefined)),
    enabled: Boolean(id),
    staleTime: 60 * 60 * 1000,
    initialData: () => findStation(id),
  });
}

// Recently played songs, refreshed every minute. Idle when no station is given
export function queryRadioPlays(station: RadioStation | undefined) {
  return queryOptions({
    queryKey: ["fetchRadioPlays", station?.id],
    queryFn: ({ signal }) => station!.fetchPlays(signal),
    enabled: Boolean(station),
    refetchInterval: 60_000,
  });
}

// The station's live broadcast as a player track. It has no Mirlo track id; the player
// tells stations apart by stream URL. Empty headers keep the Mirlo API key off the
// station's servers unless authorized external federated streaming is required.
export function liveTrack(station: RadioStation): RNTrack {
  const isExternalStream = station.streamUrl.includes("/stream/external/");
  const headers =
    station.headers ??
    (isExternalStream
      ? {
          "mirlo-api-key": API_KEY,
          "social-music-userid": getListenerUserIdSync(),
        }
      : {});

  return {
    title: station.liveName,
    artist: `Live from ${station.location}`,
    artwork: station.artwork,
    url: station.streamUrl,
    headers,
    type: audioTrackType(station.streamUrl),
    duration: RADIO_SET_SECONDS,
    liveStation: station.id,
  } as RNTrack;
}

const REGION_SEARCH_EXPANSIONS: Record<
  string,
  { languages?: string[]; countries?: string[]; tags?: string[] }
> = {
  thai: { languages: ["thai"], countries: ["Thailand"], tags: ["thai", "thailand"] },
  thailand: { languages: ["thai"], countries: ["Thailand"], tags: ["thai", "thailand"] },
  "ไทย": { languages: ["thai"], countries: ["Thailand"], tags: ["thai"] },
  bangkok: { languages: ["thai"], countries: ["Thailand"], tags: ["thai"] },
  chinese: {
    languages: ["chinese", "cantonese", "mandarin"],
    countries: ["China", "Taiwan", "Hong Kong"],
    tags: ["chinese", "c-pop"],
  },
  china: { languages: ["chinese"], countries: ["China"], tags: ["chinese"] },
  taiwan: { languages: ["chinese"], countries: ["Taiwan"], tags: ["chinese", "taiwanese pop"] },
  taiwanese: { languages: ["chinese"], countries: ["Taiwan"], tags: ["taiwanese pop"] },
  "hong kong": {
    languages: ["cantonese"],
    countries: ["Hong Kong"],
    tags: ["cantonese", "hong kong music"],
  },
  cantonese: { languages: ["cantonese"], countries: ["Hong Kong", "China"], tags: ["cantonese"] },
  mandarin: { languages: ["mandarin", "chinese"], countries: ["China", "Taiwan"], tags: ["chinese"] },
  "中文": {
    languages: ["chinese", "cantonese"],
    countries: ["China", "Taiwan", "Hong Kong"],
    tags: ["chinese"],
  },
  "华语": {
    languages: ["chinese", "cantonese"],
    countries: ["China", "Taiwan", "Hong Kong"],
    tags: ["chinese"],
  },
  "粵語": { languages: ["cantonese"], countries: ["Hong Kong"], tags: ["cantonese"] },
  japanese: { languages: ["japanese"], countries: ["Japan"], tags: ["japanese", "j-pop"] },
  japan: { languages: ["japanese"], countries: ["Japan"], tags: ["japanese"] },
  korean: { languages: ["korean"], countries: ["South Korea"], tags: ["korean", "k-pop"] },
  korea: { languages: ["korean"], countries: ["South Korea"], tags: ["korean"] },
  vietnamese: { languages: ["vietnamese"], countries: ["Vietnam"], tags: ["vietnamese"] },
  vietnam: { languages: ["vietnamese"], countries: ["Vietnam"], tags: ["vietnamese"] },
  indonesian: { languages: ["indonesian"], countries: ["Indonesia"], tags: ["indonesian"] },
  indonesia: { languages: ["indonesian"], countries: ["Indonesia"], tags: ["indonesian"] },
  filipino: { languages: ["tagalog"], countries: ["The Philippines"], tags: ["philippines", "opm"] },
  philippines: { languages: ["tagalog"], countries: ["The Philippines"], tags: ["philippines", "opm"] },
};

function matchesStationQuery(station: RadioStation, query: string): boolean {
  return (
    station.name.toLowerCase().includes(query) ||
    station.liveName.toLowerCase().includes(query) ||
    station.location.toLowerCase().includes(query) ||
    station.about.toLowerCase().includes(query) ||
    Boolean(station.tags?.some((t) => t.toLowerCase().includes(query)))
  );
}

export async function searchRadioStations(
  term: string,
  signal?: AbortSignal,
): Promise<RadioStation[]> {
  const query = term.trim().toLowerCase();
  if (!query) return [];

  const filters = getContentFilters();
  const customMatches = getCustomRadioStations().filter((s) => matchesStationQuery(s, query));
  const cachedMatches = [...DISCOVERED_STATIONS.values()].filter((s) =>
    matchesStationQuery(s, query),
  );

  const expansion = REGION_SEARCH_EXPANSIONS[query];
  const endpoints = new Set<string>([
    `https://de1.api.radio-browser.info/json/stations/byname/${encodeURIComponent(query)}?order=clickcount&reverse=true&hidebroken=true&limit=15`,
    `https://de1.api.radio-browser.info/json/stations/bytag/${encodeURIComponent(query)}?order=clickcount&reverse=true&hidebroken=true&limit=15`,
    `https://de1.api.radio-browser.info/json/stations/bylanguage/${encodeURIComponent(query)}?order=clickcount&reverse=true&hidebroken=true&limit=15`,
  ]);

  if (expansion) {
    for (const lang of expansion.languages || []) {
      endpoints.add(
        `https://de1.api.radio-browser.info/json/stations/bylanguage/${encodeURIComponent(lang)}?order=clickcount&reverse=true&hidebroken=true&limit=15`,
      );
    }
    for (const country of expansion.countries || []) {
      endpoints.add(
        `https://de1.api.radio-browser.info/json/stations/bycountry/${encodeURIComponent(country)}?order=clickcount&reverse=true&hidebroken=true&limit=15`,
      );
    }
    for (const tag of expansion.tags || []) {
      endpoints.add(
        `https://de1.api.radio-browser.info/json/stations/bytag/${encodeURIComponent(tag)}?order=clickcount&reverse=true&hidebroken=true&limit=15`,
      );
    }
  }

  let remoteStations: RadioStation[] = [];
  try {
    const settled = await Promise.allSettled(
      [...endpoints].map(async (endpoint) => {
        const res = await fetch(endpoint, {
          headers: RADIO_BROWSER_HEADERS,
          signal,
        });
        if (!res.ok) return [];
        const data: RadioBrowserStation[] = await res.json();
        return Array.isArray(data) ? data : [];
      }),
    );

    const combined = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    remoteStations = combined
      .filter((rb) => isPlayableRadioBrowserStation(rb, filters))
      .map(radioBrowserToRadioStation);
  } catch {
    // Return custom and cached matches if remote search fails
  }

  return deduplicateRadioStations([...customMatches, ...cachedMatches, ...remoteStations], filters);
}
