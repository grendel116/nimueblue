import { queryOptions } from "@tanstack/react-query";
import { audioTrackType, decodeHtmlEntities, isQualityArtwork } from "@/scripts/utils";
import { API_KEY } from "@/constants/api-key";
import { getListenerUserIdSync } from "@/scripts/listenerIdentity";
// A station plays as a 10-minute set in the queue, then playback moves on to what's next
import { RADIO_SET_SECONDS } from "@/scripts/radioTimer";

// Independent radio stations shown on Home. Each station has a live stream and a
// public feed of what's on air. All feeds except WFMU's are CORS-open, so web reads them directly.

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
  tags?: string[];
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

// KEXP: "trackplay" entries are songs, other play types are air breaks
type KexpPlay = {
  id: number;
  airdate: string;
  play_type: string;
  song: string;
  artist: string;
  thumbnail_uri: string;
  image_uri: string;
};

const KEXP: RadioStation = {
  id: "kexp",
  name: "KEXP",
  liveName: "KEXP 90.3 FM",
  location: "Seattle",
  artwork:
    "https://www.kexp.org/media/filer_public/4f/52/4f52b5aa-bd93-4fe7-ab94-2d3258a3804c/kexp_primarylogo_black.png",
  about:
    "Listener-powered, non-profit radio from Seattle, championing new and independent music since 1972.",
  streamUrl: "https://kexp.streamguys1.com/kexp160.aac",
  playlistPage: "https://www.kexp.org/playlist/",
  donatePage: "https://www.kexp.org/donate/",
  fetchPlays: async (signal) => {
    const data = await getJson<{ results: KexpPlay[] }>(
      "https://api.kexp.org/v2/plays/?format=json&limit=5",
      signal,
    );
    const track = data.results.find((p) => p.play_type === "trackplay");
    if (!track) return [];
    return [
      {
        key: String(track.id),
        song: track.song,
        artist: track.artist,
        airdate: track.airdate,
        artwork: toArtworkUrl(track.image_uri) || toArtworkUrl(track.thumbnail_uri),
      },
    ];
  },
};

// Carbon Sound (MPR): the same now-playing service behind carbonsound.fm/playlist
type PublicRadioSong = {
  song_id: number;
  title: string;
  artist: string;
  played_at: string;
  art_url: string | null;
};

const CARBON_SOUND: RadioStation = {
  id: "carbon-sound",
  name: "Carbon Sound",
  liveName: "Carbon Sound",
  location: "Minneapolis",
  artwork:
    "https://img.apmcdn.org/cb53893e052517a661546c52c2e5401774619f99/uncropped/d82f35-20220711-carbon-sound-png-1826.png",
  about:
    "Minnesota Public Radio's stream for Black music past and present: hip-hop, soul, R&B and more.",
  streamUrl: "https://carbonsound.stream.publicradio.org/carbonsound.aac",
  playlistPage: "https://www.carbonsound.fm/playlist",
  donatePage: "https://support.mpr.org/carbon-sound-web",
  fetchPlays: async (signal) => {
    const data = await getJson<{ data: { songs: PublicRadioSong[] } }>(
      "https://nowplaying.publicradio.org/carbon-sound/playlist",
      signal,
    );
    const song = data.data?.songs?.[0];
    if (!song) return [];
    return [
      {
        key: `${song.song_id}-${song.played_at}`,
        song: song.title,
        artist: song.artist,
        airdate: song.played_at,
        artwork: toArtworkUrl(song.art_url),
      },
    ];
  },
};

// WFMU: the feed holds only what's on now. When the DJ logs songs live, that's the
// current song; otherwise it's the show. Text fields arrive HTML-escaped
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


const WFMU_LOGO =
  "https://is1-ssl.mzstatic.com/image/thumb/Purple126/v4/12/46/a8/1246a8d2-9aac-c896-868b-c9f78c278c6e/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220.jpeg/512x512bb.jpg";

const WFMU: RadioStation = {
  id: "wfmu",
  name: "WFMU",
  liveName: "WFMU 91.1 FM",
  location: "Jersey City",
  artwork: WFMU_LOGO,
  about:
    "Listener-supported freeform radio since 1958, with no playlists, no formats and DJs who play whatever they love.",
  streamUrl: "https://stream0.wfmu.org/freeform-128k.mp3",
  playlistPage: "https://wfmu.org/playlists/",
  donatePage: "https://pledge.wfmu.org/",
  fetchPlays: async (signal) => {
    const { program, episode, segment } = await getJson<WfmuNow>(
      "https://wfmu.org/currentliveshows.php?json=1&c=1",
      signal,
    );
    const now = new Date().toISOString();
    if (segment.id && !segment.set_break_flag && segment.title_html) {
      return [
        {
          key: String(segment.id),
          song: decodeHtmlEntities(segment.title_html),
          artist: decodeHtmlEntities(segment.artist_html ?? ""),
          airdate: now,
          artwork: toArtworkUrl(segment.image) || WFMU_LOGO,
        },
      ];
    }
    if (!program.title_html) return [];
    return [
      {
        key: `show-${program.id}-${episode.id}`,
        song: decodeHtmlEntities(program.title_html),
        artist: "WFMU",
        airdate: now,
        artwork: WFMU_LOGO,
      },
    ];
  },
};

// Radio alHara: communal cultural space and solidarity broadcast from Bethlehem, Palestine
const RADIO_ALHARA: RadioStation = {
  id: "radio-alhara",
  name: "Radio alHara",
  liveName: "Radio alHara",
  location: "Bethlehem, Palestine",
  artwork: "https://radioalhara.net/img/radio-alhara-logo-512.png",
  about:
    "Communal, independent Palestinian radio station and cultural space broadcast from Bethlehem, dedicated to solidarity and artistic resistance across the Global South.",
  streamUrl: "https://stream.radioalhara.net/ra",
  playlistPage: "https://radioalhara.net/",
  donatePage: "https://radioalhara.net/",
  fetchPlays: async () => [
    {
      key: "alhara-live",
      song: "Radio alHara",
      artist: "Live from Bethlehem",
      airdate: new Date().toISOString(),
      artwork: "https://radioalhara.net/img/radio-alhara-logo-512.png",
    },
  ],
};

// Dublin Digital Radio: wholly funded by listeners and members, anti-capitalist, community-operated
const DDR: RadioStation = {
  id: "dublin-digital-radio",
  name: "ddr.",
  liveName: "Dublin Digital Radio (ddr.)",
  location: "Dublin, Ireland",
  artwork:
    "https://play-lh.googleusercontent.com/mVz6RPCPV4vBX875xKk8tiBJ-z-A2hqbf3QO2SSSYxe_RtyPUumEXlxmETuYbsXHsUw",
  about:
    "Wholly member-funded and democratically operated alternative community radio station representing experimental music, art, and radical politics across Ireland.",
  streamUrl: "https://dublin-digital-radio.radiocult.fm/stream",
  playlistPage: "https://listen.dublindigitalradio.com",
  donatePage: "https://listen.dublindigitalradio.com/support",
  fetchPlays: async () => [
    {
      key: "ddr-live",
      song: "Dublin Digital Radio",
      artist: "Community Broadcast",
      airdate: new Date().toISOString(),
      artwork: "https://play-lh.googleusercontent.com/mVz6RPCPV4vBX875xKk8tiBJ-z-A2hqbf3QO2SSSYxe_RtyPUumEXlxmETuYbsXHsUw",
    },
  ],
};

const RESONANCE_LOGO =
  "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/2d/ee/1c/2dee1cc1-fec2-52ab-df7a-b5d66f8163d8/AppIcon-1x_U007emarketing-0-11-0-85-220-0.png/512x512bb.jpg";

// Resonance FM: the UK's radio arts station operated by the London Musicians' Collective
const RESONANCE_FM: RadioStation = {
  id: "resonance-fm",
  name: "Resonance FM",
  liveName: "Resonance 104.4 FM",
  location: "London, UK",
  artwork: RESONANCE_LOGO,
  about:
    "The world's first radio art station, operated by the London Musicians' Collective. Freeform, non-commercial, and volunteer-powered.",
  streamUrl: "https://stream.resonance.fm/resonance",
  playlistPage: "https://www.resonancefm.com",
  donatePage: "https://www.resonancefm.com/donate",
  fetchPlays: async () => [
    {
      key: "resonance-live",
      song: "Resonance 104.4 FM",
      artist: "Radio Arts & Freeform",
      airdate: new Date().toISOString(),
      artwork: RESONANCE_LOGO,
    },
  ],
};

// Refuge Worldwide: titles read "Show - Hosts"; only the current show carries a start time
type RadioCoStatus = {
  current_track: { title: string; start_time: string; artwork_url: string };
};

const REFUGE: RadioStation = {
  id: "refuge",
  name: "Refuge Worldwide",
  liveName: "Refuge Worldwide",
  location: "Berlin",
  artwork: "https://images.radio.co/station_logos/s3699c5e49.20201221111634.png",
  about:
    "Community radio and fundraising platform from Berlin-Neukölln, giving airtime to grassroots causes and the artists around them.",
  streamUrl: "https://streaming.radio.co/s3699c5e49/listen",
  playlistPage: "https://refugeworldwide.com/radio",
  donatePage: "https://refugeworldwide.com/support",
  fetchPlays: async (signal) => {
    const { current_track: show } = await getJson<RadioCoStatus>(
      "https://public.radio.co/stations/s3699c5e49/status",
      signal,
    );
    const [title, ...hosts] = show.title.split(" - ");
    return [
      {
        key: `${show.start_time}-${show.title}`,
        song: title,
        artist: hosts.join(" - ") || "Refuge Worldwide",
        airdate: show.start_time,
        artwork: toArtworkUrl(show.artwork_url) || "https://images.radio.co/station_logos/s3699c5e49.20201221111634.png",
      },
    ];
  },
};

// Bangkok Community Radio: independent Thai and Southeast Asian music and sound culture
const BANGKOK_COMMUNITY_RADIO_LOGO =
  "https://unify-fm-bucket.s3.us-west-2.amazonaws.com/bangkok_community_radio_logo.jpg";

const BANGKOK_COMMUNITY_RADIO: RadioStation = {
  id: "bangkok-community-radio",
  name: "Bangkok Community Radio",
  liveName: "Bangkok Community Radio",
  location: "Bangkok, Thailand",
  artwork: BANGKOK_COMMUNITY_RADIO_LOGO,
  about:
    "Independent community radio from Bangkok showcasing underground Thai and Southeast Asian music, DJs, and sound culture.",
  streamUrl: "https://bcr.radiocult.fm/stream",
  playlistPage: "https://bangkokcommunityradio.com",
  donatePage: "https://bangkokcommunityradio.com",
  tags: ["thai", "thailand", "bangkok", "southeast asia", "community radio", "ไทย"],
  fetchPlays: async () => [
    {
      key: "bcr-live",
      song: "Bangkok Community Radio",
      artist: "Live from Bangkok",
      airdate: new Date().toISOString(),
      artwork: BANGKOK_COMMUNITY_RADIO_LOGO,
    },
  ],
};

// 广东音乐之声 (Guangdong Music FM): China's pioneering music radio broadcast from Guangzhou (FM 99.3)
const GUANGDONG_MUSIC_LOGO =
  "https://grendel116.github.io/nimueblue/guangdong-music-fm.png";

const GUANGDONG_MUSIC: RadioStation = {
  id: "guangdong-music-fm",
  name: "广东音乐之声",
  liveName: "广东音乐之声 (FM 99.3)",
  location: "Guangzhou, China",
  artwork: GUANGDONG_MUSIC_LOGO,
  about:
    "Pioneering music radio broadcast from Guangzhou (FM 99.3), showcasing Cantonese and Mandarin pop, classic golden hits, and regional Chinese sound culture.",
  streamUrl: "https://lhttp.qtfm.cn/live/1260/64k.mp3",
  playlistPage: "https://www.gdtv.cn/",
  donatePage: "https://www.gdtv.cn/",
  tags: [
    "chinese",
    "china",
    "guangzhou",
    "guangdong",
    "cantonese",
    "mandarin",
    "c-pop",
    "cantopop",
    "indie",
    "folk",
    "中文",
    "华语",
    "粵語",
    "广东",
    "广州",
    "音乐",
  ],
  fetchPlays: async () => [
    {
      key: "guangdong-music-live",
      song: "广东音乐之声 FM 99.3",
      artist: "Live from Guangzhou",
      airdate: new Date().toISOString(),
      artwork: GUANGDONG_MUSIC_LOGO,
    },
  ],
};

export const RADIO_STATIONS: RadioStation[] = [
  KEXP,
  CARBON_SOUND,
  WFMU,
  RADIO_ALHARA,
  DDR,
  RESONANCE_FM,
  REFUGE,
  BANGKOK_COMMUNITY_RADIO,
  GUANGDONG_MUSIC,
];

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

// Words that keep a station out of the lineup when they appear in its name or tags:
// commercial chart formats ("#100 BEST IBIZA DEEP HOUSE", "top 40", "singlecharts") and K-Pop
export const EXCLUDED_STATION_TERMS = [
  "100",
  "top",
  "chart",
  "charts",
  "singlecharts",
  "partycharts",
  "hot ac",
  "k-pop",
  "kpop",
  "k pop",
  "korean pop",
];

// Matches a listed term as a whole word, so "top" catches "Top 40" and leaves "laptop"
const EXCLUDED_TERM_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${EXCLUDED_STATION_TERMS.join("|")})(?![\\p{L}\\p{N}])`,
  "iu",
);

// Commercial networks named like "- 0 N - 2000s on Radio" and "- 1 A - Schlager"
const DASHED_NETWORK_NAME = /(?:^|\s)-\s+\S{1,2}\s+\S{1,2}\s+-(?:\s|$)/;

// Advertising copy in a name, such as "CHARTS ---> Club Classics" or "STARTS HERE @ Technolovers.fm"
const ADVERTISING_NAME = /->|→|»|>>|@/;

export function isExcludedStation(names: (string | undefined)[], tags: string[]): boolean {
  const cleanNames = names.map((name) => name || "");
  return (
    cleanNames.some((name) => DASHED_NETWORK_NAME.test(name) || ADVERTISING_NAME.test(name)) ||
    [...cleanNames, ...tags].some((text) => EXCLUDED_TERM_PATTERN.test(text))
  );
}

export function deduplicateRadioStations(
  stations: RadioStation[],
): RadioStation[] {
  const seenIdentities = new Set<string>();
  return stations.filter((station) => {
    if (isExcludedStation([station.name, station.liveName], station.tags ?? [])) {
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

export const EXCLUDED_COLONIAL_COUNTRIES = new Set([
  "morocco",
  "maroc",
  "kingdom of morocco",
  "israel",
  "state of israel",
  "united arab emirates",
  "the united arab emirates",
  "uae",
  "saudi arabia",
  "kingdom of saudi arabia",
  "turkey",
  "türkiye",
  "turkiye",
  "republic of turkey",
  "republic of türkiye",
  "russia",
  "russian federation",
  "the russian federation",
  "azerbaijan",
  "republic of azerbaijan",
  "rwanda",
  "republic of rwanda",
  "qatar",
  "state of qatar",
  "bahrain",
  "kingdom of bahrain",
  "kuwait",
  "state of kuwait",
]);

export const EXCLUDED_COLONIAL_COUNTRY_CODES = new Set([
  "ma",
  "il",
  "ae",
  "sa",
  "tr",
  "ru",
  "az",
  "rw",
  "qa",
  "bh",
  "kw",
]);

export function isExcludedColonialStation(rb: RadioBrowserStation): boolean {
  const country = (rb.country || "").trim().toLowerCase();
  if (country && EXCLUDED_COLONIAL_COUNTRIES.has(country)) return true;

  const code = (rb.countrycode || "").trim().toLowerCase();
  if (code && EXCLUDED_COLONIAL_COUNTRY_CODES.has(code)) return true;

  const state = (rb.state || "").trim().toLowerCase();
  if (state && EXCLUDED_COLONIAL_COUNTRIES.has(state)) return true;

  return false;
}

export function isPlayableRadioBrowserStation(rb: RadioBrowserStation): boolean {
  if (isExcludedColonialStation(rb)) return false;
  const name = rb.name || "";
  if (!name.trim()) return false;
  if (isExcludedStation([name], (rb.tags || "").split(","))) return false;
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

export const RADICAL_RADIO_TAGS = [
  "pirate radio",
  "community radio",
  "free radio",
  "freies radio",
  "radio libre",
  "diy",
  "underground",
  "thai",
  "chinese",
  "world music",
];

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
  limit: number = 8,
  signal?: AbortSignal,
): Promise<RadioStation[]> {
  const results = await Promise.allSettled(
    RADICAL_RADIO_TAGS.map(async (tag) => {
      const endpoint = `https://de1.api.radio-browser.info/json/stations/bytag/${encodeURIComponent(tag)}?order=clicktimestamp&reverse=true&hidebroken=true&limit=${limit * 3}`;
      const res = await fetch(endpoint, { signal });
      if (!res.ok) throw new Error(`Radio-Browser tag search failed (${tag}): ${res.status}`);
      const data: RadioBrowserStation[] = await res.json();
      if (!Array.isArray(data)) {
        throw new Error(`Radio-Browser returned an invalid station list for tag: ${tag}`);
      }
      return data;
    }),
  );

  if (signal?.aborted) throw signal.reason;

  const stationLists = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return [result.value];
    console.warn(`Radio-Browser tag search failed (${RADICAL_RADIO_TAGS[index]}):`, result.reason);
    return [];
  });
  if (stationLists.length === 0) {
    throw new Error("All Radio-Browser tag searches failed.");
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
    .filter(isPlayableRadioBrowserStation)
    .slice(0, limit)
    .map(radioBrowserToRadioStation);
}

export function queryDiscoveredRadioStations(limit: number = 8) {
  return queryOptions({
    queryKey: ["discoveredRadioStations", limit],
    queryFn: ({ signal }) => fetchDiscoveredRadioStations(limit, signal),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

export function findStation(id: string | undefined): RadioStation | undefined {
  if (!id) return undefined;
  return RADIO_STATIONS.find((s) => s.id === id) || DISCOVERED_STATIONS.get(id);
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
  const headers = station.headers ?? (isExternalStream
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
  "hong kong": { languages: ["cantonese"], countries: ["Hong Kong"], tags: ["cantonese", "hong kong music"] },
  cantonese: { languages: ["cantonese"], countries: ["Hong Kong", "China"], tags: ["cantonese"] },
  mandarin: { languages: ["mandarin", "chinese"], countries: ["China", "Taiwan"], tags: ["chinese"] },
  "中文": { languages: ["chinese", "cantonese"], countries: ["China", "Taiwan", "Hong Kong"], tags: ["chinese"] },
  "华语": { languages: ["chinese", "cantonese"], countries: ["China", "Taiwan", "Hong Kong"], tags: ["chinese"] },
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

  const curatedMatches = RADIO_STATIONS.filter((s) => matchesStationQuery(s, query));
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
        const res = await fetch(endpoint, { signal });
        if (!res.ok) return [];
        const data: RadioBrowserStation[] = await res.json();
        return Array.isArray(data) ? data : [];
      }),
    );

    const combined = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    remoteStations = combined
      .filter(isPlayableRadioBrowserStation)
      .map(radioBrowserToRadioStation);
  } catch {
    // Return curated and cached matches if remote search fails
  }

  return deduplicateRadioStations([...curatedMatches, ...cachedMatches, ...remoteStations]);
}
