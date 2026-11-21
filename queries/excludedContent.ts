import { useEffect, useState } from "react";
import { kvStorage } from "@/scripts/storage/kvStorage";

export type CustomStationSpec = {
  id: string;
  name: string;
  liveName?: string;
  location?: string;
  artwork?: string;
  about?: string;
  streamUrl: string;
  playlistPage?: string;
  donatePage?: string;
  nowPlayingUrl?: string;
  tags?: string[];
  isCustom?: boolean;
};

export type CustomPodcastSpec = {
  id: string;
  name: string;
  author?: string;
  description?: string;
  artwork?: string;
  feedUrl: string;
  webUrl?: string;
  supportUrl?: string;
  lastUpdated?: string;
  isCustom?: boolean;
};

export type ContentFilters = {
  excludedTerms: string[];
  excludedPatterns: string[];
  excludedCountries: string[];
  excludeCommercialFormatNames: boolean;
  radioDiscoveryTags: string[];
  podcastDiscoveryTerms: string[];
};

export type CurationConfig = {
  stations: CustomStationSpec[];
  podcasts: CustomPodcastSpec[];
  filters: ContentFilters;
};

// Migrated terms, patterns, countries, discovery tags, stations, and podcasts.
// The base app starts completely unrestricted and blank; users can load or customize
// these client-side in Settings/Curation or via nimue-library.json.
export const EXCLUDED_TERMS = [
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
  "forbes",
];

// Fascist, white-nationalist and Christian-nationalist movements and their media. Each entry names
// the movement, its organizations or its outlets; the bare word "America" is not blocked, so
// Americana, Latin America and "Native America" stay in. A pattern is a regular expression source.
export const FASCIST_MOVEMENT_PATTERNS = [
  // Nazism and its descendants. "anti-nazi" and "antifascist" titles stay in
  "(?<!anti[-\\s]?)nazis?",
  "neo[-\\s]?nazis?",
  "national[-\\s]?socialis[mt]",
  "(?<!anti[-\\s]?)fascis[mt]s?",
  "white[-\\s](?:nationalis[mt]s?|supremac(?:y|ists?)|power|pride|genocide)",
  "alt[-\\s]?right",
  "identitarian",
  "race[-\\s]realis[mt]",
  "stormfront",
  "third[-\\s]position",
  // Christian nationalism
  "christian[-\\s](?:nationalis[mt]s?|reconstructionis[mt]|dominionis[mt])",
  "dominionis[mt]",
  "new[-\\s]apostolic[-\\s]reformation",
  "seven[-\\s]mountains?",
  "christian[-\\s]identity",
  "god[,\\s]+guns?[,\\s]+(?:and[-\\s]+)?(?:country|glory)",
  "one[-\\s]nation[-\\s]under[-\\s]god",
  // American nationalism and militia politics
  "american[-\\s](?:nationalis[mt]s?|patriots?|first|freedom[-\\s](?:radio|network|news))",
  "patriot[-\\s](?:radio|news|network|talk|nation|front)",
  "america[-\\s]first",
  "make[-\\s]america[-\\s]great",
  "maga",
  "proud[-\\s]boys",
  "oath[-\\s]keepers",
  "three[-\\s]percenters?",
  "boogaloo",
  "qanon",
  "turning[-\\s]point[-\\s](?:usa|action)",
  // Outlets and hosts of the American far right
  "infowars",
  "breitbart",
  "newsmax",
  "daily[-\\s]wire",
  "the[-\\s]blaze",
  "oann",
  "one[-\\s]america[-\\s]news",
  "(?:alex[-\\s]jones|steve[-\\s]bannon|charlie[-\\s]kirk|tucker[-\\s]carlson|rush[-\\s]limbaugh|glenn[-\\s]beck|sean[-\\s]hannity|michael[-\\s]savage|laura[-\\s]ingraham)",
];

export const MIGRATED_EXCLUDED_COUNTRIES = [
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
];

export const MIGRATED_EXCLUDED_COUNTRY_CODES = [
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
];

export const MIGRATED_RADICAL_RADIO_TAGS = [
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

export const MIGRATED_PODCAST_DISCOVERY_TERMS = [
  "anarch",
  "communis",
  "liberation theology",
  "liberationtheology",
  "anti-capital",
  "anticapital",
  "worker cooperat",
  "solidarity economics",
  "pirate radio",
  "environmentalism",
  "solarpunk",
  "climate justice",
  "degrowth",
  "permaculture",
  "food sovereignty",
  "labor history",
  "working class history",
  "working-class history",
  "labor movement",
  "union history",
  "general strike",
  "radical history",
  "peoples history",
  "people's history",
  "anti-colonial",
  "anticolonial",
  "anti-imperial",
  "antiimperial",
  "decolonial",
  "social ecology",
];

export const MIGRATED_STATION_SPECS: CustomStationSpec[] = [
  {
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
    nowPlayingUrl: "https://api.kexp.org/v2/plays/?format=json&limit=5",
  },
  {
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
    nowPlayingUrl: "https://nowplaying.publicradio.org/carbon-sound/playlist",
  },
  {
    id: "wfmu",
    name: "WFMU",
    liveName: "WFMU 91.1 FM",
    location: "Jersey City",
    artwork:
      "https://is1-ssl.mzstatic.com/image/thumb/Purple126/v4/12/46/a8/1246a8d2-9aac-c896-868b-c9f78c278c6e/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220.jpeg/512x512bb.jpg",
    about:
      "Listener-supported freeform radio since 1958, with no playlists, no formats and DJs who play whatever they love.",
    streamUrl: "https://stream0.wfmu.org/freeform-128k.mp3",
    playlistPage: "https://wfmu.org/playlists/",
    donatePage: "https://pledge.wfmu.org/",
    nowPlayingUrl: "https://wfmu.org/currentliveshows.php?json=1&c=1",
  },
  {
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
  },
  {
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
  },
  {
    id: "resonance-fm",
    name: "Resonance FM",
    liveName: "Resonance 104.4 FM",
    location: "London, UK",
    artwork:
      "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/2d/ee/1c/2dee1cc1-fec2-52ab-df7a-b5d66f8163d8/AppIcon-1x_U007emarketing-0-11-0-85-220-0.png/512x512bb.jpg",
    about:
      "The world's first radio art station, operated by the London Musicians' Collective. Freeform, non-commercial, and volunteer-powered.",
    streamUrl: "https://stream.resonance.fm/resonance",
    playlistPage: "https://www.resonancefm.com",
    donatePage: "https://www.resonancefm.com/donate",
  },
  {
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
    nowPlayingUrl: "https://public.radio.co/stations/s3699c5e49/status",
  },
  {
    id: "bangkok-community-radio",
    name: "Bangkok Community Radio",
    liveName: "Bangkok Community Radio",
    location: "Bangkok, Thailand",
    artwork:
      "https://unify-fm-bucket.s3.us-west-2.amazonaws.com/bangkok_community_radio_logo.jpg",
    about:
      "Independent community radio from Bangkok showcasing underground Thai and Southeast Asian music, DJs, and sound culture.",
    streamUrl: "https://bcr.radiocult.fm/stream",
    playlistPage: "https://bangkokcommunityradio.com",
    donatePage: "https://bangkokcommunityradio.com",
    tags: ["thai", "thailand", "bangkok", "southeast asia", "community radio", "ไทย"],
  },
  {
    id: "guangdong-music-fm",
    name: "广东音乐之声",
    liveName: "广东音乐之声 (FM 99.3)",
    location: "Guangzhou, China",
    artwork: "https://grendel116.github.io/nimueblue/guangdong-music-fm.png",
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
  },
  {
    id: "worldwide-fm",
    name: "Worldwide FM",
    liveName: "Worldwide FM",
    location: "London, UK",
    artwork: "https://grendel116.github.io/nimueblue/worldwide-fm.png",
    about:
      "Award-winning independent radio and cultural platform founded by Gilles Peterson, broadcasting jazz, underground sounds, and global music culture from London.",
    streamUrl: "https://worldwide-fm.radiocult.fm/stream",
    playlistPage: "https://www.worldwidefm.net/",
    donatePage: "https://www.worldwidefm.net/support",
    tags: [
      "jazz",
      "world music",
      "electronica",
      "underground",
      "london",
      "uk",
      "community radio",
      "progressive",
    ],
  },
  {
    id: "rhythm-and-soul-patrol",
    name: "Rhythm & Soul Patrol",
    liveName: "Rhythm & Soul Patrol (WRSP-LR)",
    location: "Detroit",
    artwork: "https://grendel116.github.io/nimueblue/rhythm-and-soul-patrol.png",
    about:
      "Independent Detroit radio broadcast hosted and curated by Lindsey Renee, celebrating classic soul, R&B, Motown, deep cuts, and the stories behind the records.",
    streamUrl: "https://stream.zeno.fm/o8xbrffwhwjtv",
    playlistPage: "https://rhythmandsoulpatrol.com/",
    donatePage: "https://rhythmandsoulpatrol.com/",
    tags: [
      "soul",
      "r&b",
      "rnb",
      "motown",
      "funk",
      "oldies",
      "detroit",
      "wrsp",
      "lindsey renee",
    ],
    nowPlayingUrl: "https://zenoplay.zenomedia.com/api/zenofm/nowplaying/o8xbrffwhwjtv",
  },
];

export const MIGRATED_PODCAST_SPECS: CustomPodcastSpec[] = [
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
];

export const MIGRATED_CURATION_PRESET: CurationConfig = {
  stations: MIGRATED_STATION_SPECS.map((s) => ({ ...s, isCustom: true })),
  podcasts: MIGRATED_PODCAST_SPECS.map((p) => ({ ...p, isCustom: true })),
  filters: {
    excludedTerms: [...EXCLUDED_TERMS],
    excludedPatterns: [...FASCIST_MOVEMENT_PATTERNS],
    excludedCountries: [...MIGRATED_EXCLUDED_COUNTRIES, ...MIGRATED_EXCLUDED_COUNTRY_CODES],
    excludeCommercialFormatNames: true,
    radioDiscoveryTags: [...MIGRATED_RADICAL_RADIO_TAGS],
    podcastDiscoveryTerms: [...MIGRATED_PODCAST_DISCOVERY_TERMS],
  },
};

export const DEFAULT_CONTENT_FILTERS: ContentFilters = {
  excludedTerms: [],
  excludedPatterns: [],
  excludedCountries: [],
  excludeCommercialFormatNames: false,
  radioDiscoveryTags: [],
  podcastDiscoveryTerms: [],
};

export const DEFAULT_CURATION_CONFIG: CurationConfig = {
  stations: [],
  podcasts: [],
  filters: { ...DEFAULT_CONTENT_FILTERS },
};

export const CURATION_STORAGE_KEY = "nimue.curation_v1";

// Commercial networks named like "- 0 N - 2000s on Radio" and "- 1 A - Schlager"
const DASHED_NETWORK_NAME = /(?:^|\s)-\s+\S{1,2}\s+\S{1,2}\s+-(?:\s|$)/;

// Advertising copy in a name, such as "CHARTS ---> Club Classics" or "STARTS HERE @ Technolovers.fm"
const ADVERTISING_NAME = /->|→|»|>>|@/;

function cleanStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

function cleanPatternList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function normalizeStationSpec(raw: unknown): CustomStationSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const streamUrl = typeof obj.streamUrl === "string" ? obj.streamUrl.trim() : "";
  if (!name || !streamUrl) return null;
  const id =
    typeof obj.id === "string" && obj.id.trim()
      ? obj.id.trim()
      : `custom-${slugify(name)}-${shortHash(streamUrl)}`;
  const tags = cleanStringList(obj.tags).map((t) => t.toLowerCase());
  return {
    id,
    name,
    ...(typeof obj.liveName === "string" && obj.liveName.trim()
      ? { liveName: obj.liveName.trim() }
      : {}),
    ...(typeof obj.location === "string" && obj.location.trim()
      ? { location: obj.location.trim() }
      : {}),
    ...(typeof obj.artwork === "string" && obj.artwork.trim()
      ? { artwork: obj.artwork.trim() }
      : {}),
    ...(typeof obj.about === "string" && obj.about.trim() ? { about: obj.about.trim() } : {}),
    streamUrl,
    ...(typeof obj.playlistPage === "string" && obj.playlistPage.trim()
      ? { playlistPage: obj.playlistPage.trim() }
      : {}),
    ...(typeof obj.donatePage === "string" && obj.donatePage.trim()
      ? { donatePage: obj.donatePage.trim() }
      : {}),
    ...(typeof obj.nowPlayingUrl === "string" && obj.nowPlayingUrl.trim()
      ? { nowPlayingUrl: obj.nowPlayingUrl.trim() }
      : {}),
    ...(tags.length > 0 ? { tags } : {}),
    isCustom: true,
  };
}

function normalizePodcastSpec(raw: unknown): CustomPodcastSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const feedUrl = typeof obj.feedUrl === "string" ? obj.feedUrl.trim() : "";
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!feedUrl || !name) return null;
  const id =
    typeof obj.id === "string" && obj.id.trim()
      ? obj.id.trim()
      : `custom-pod-${slugify(name)}-${shortHash(feedUrl)}`;
  return {
    id,
    name,
    ...(typeof obj.author === "string" && obj.author.trim() ? { author: obj.author.trim() } : {}),
    ...(typeof obj.description === "string" && obj.description.trim()
      ? { description: obj.description.trim() }
      : {}),
    ...(typeof obj.artwork === "string" && obj.artwork.trim()
      ? { artwork: obj.artwork.trim() }
      : {}),
    feedUrl,
    ...(typeof obj.webUrl === "string" && obj.webUrl.trim()
      ? { webUrl: obj.webUrl.trim() }
      : {}),
    ...(typeof obj.supportUrl === "string" && obj.supportUrl.trim()
      ? { supportUrl: obj.supportUrl.trim() }
      : {}),
    ...(typeof obj.lastUpdated === "string" && obj.lastUpdated.trim()
      ? { lastUpdated: obj.lastUpdated.trim() }
      : {}),
    isCustom: true,
  };
}

export function normalizeCurationConfig(raw: unknown): CurationConfig {
  if (!raw || typeof raw !== "object") {
    return {
      stations: [],
      podcasts: [],
      filters: { ...DEFAULT_CONTENT_FILTERS },
    };
  }
  const obj = raw as Record<string, unknown>;
  const rawFilters =
    obj.filters && typeof obj.filters === "object"
      ? (obj.filters as Record<string, unknown>)
      : {};

  const stations: CustomStationSpec[] = [];
  const seenStationIds = new Set<string>();
  if (Array.isArray(obj.stations)) {
    for (const item of obj.stations) {
      const normalized = normalizeStationSpec(item);
      if (normalized && !seenStationIds.has(normalized.id)) {
        seenStationIds.add(normalized.id);
        stations.push(normalized);
      }
    }
  }

  const podcasts: CustomPodcastSpec[] = [];
  const seenPodcastIds = new Set<string>();
  if (Array.isArray(obj.podcasts)) {
    for (const item of obj.podcasts) {
      const normalized = normalizePodcastSpec(item);
      if (normalized && !seenPodcastIds.has(normalized.id)) {
        seenPodcastIds.add(normalized.id);
        podcasts.push(normalized);
      }
    }
  }

  return {
    stations,
    podcasts,
    filters: {
      excludedTerms: cleanStringList(rawFilters.excludedTerms),
      excludedPatterns: cleanPatternList(rawFilters.excludedPatterns),
      excludedCountries: cleanStringList(rawFilters.excludedCountries).map((c) => c.toLowerCase()),
      excludeCommercialFormatNames: Boolean(rawFilters.excludeCommercialFormatNames),
      radioDiscoveryTags: cleanStringList(rawFilters.radioDiscoveryTags).map((t) =>
        t.toLowerCase(),
      ),
      podcastDiscoveryTerms: cleanStringList(rawFilters.podcastDiscoveryTerms).map((t) =>
        t.toLowerCase(),
      ),
    },
  };
}

export function isNonEmptyCurationConfig(config: CurationConfig): boolean {
  return (
    config.stations.length > 0 ||
    config.podcasts.length > 0 ||
    config.filters.excludedTerms.length > 0 ||
    config.filters.excludedPatterns.length > 0 ||
    config.filters.excludedCountries.length > 0 ||
    config.filters.excludeCommercialFormatNames ||
    config.filters.radioDiscoveryTags.length > 0 ||
    config.filters.podcastDiscoveryTerms.length > 0
  );
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "item"
  );
}

function shortHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildWholeWordRegex(sources: string[]): RegExp | null {
  if (sources.length === 0) return null;
  const validSources: string[] = [];
  for (const src of sources) {
    if (!src) continue;
    try {
      new RegExp(src, "iu");
      validSources.push(src);
    } catch {
      // Skip invalid user regex sources rather than breaking playback or search
    }
  }
  if (validSources.length === 0) return null;
  try {
    return new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${validSources.join("|")})(?![\\p{L}\\p{N}])`,
      "iu",
    );
  } catch {
    return null;
  }
}

let cachedConfig: CurationConfig | null = null;
let cachedRawString: string | undefined;
const listeners = new Set<(config: CurationConfig) => void>();

function readFromStorage(): CurationConfig {
  try {
    const raw = kvStorage.getString(CURATION_STORAGE_KEY);
    if (cachedConfig && raw === cachedRawString) {
      return cachedConfig;
    }
    cachedRawString = raw;
    cachedConfig = raw ? normalizeCurationConfig(JSON.parse(raw)) : normalizeCurationConfig(null);
    return cachedConfig;
  } catch {
    cachedRawString = undefined;
    cachedConfig = normalizeCurationConfig(null);
    return cachedConfig;
  }
}

function writeToStorage(next: CurationConfig): CurationConfig {
  const normalized = normalizeCurationConfig(next);
  const serialized = JSON.stringify(normalized);
  cachedConfig = normalized;
  cachedRawString = serialized;
  try {
    kvStorage.set(CURATION_STORAGE_KEY, serialized);
  } catch (err) {
    console.error("Failed to persist curation config:", err);
  }
  listeners.forEach((listener) => listener(normalized));
  return normalized;
}

export function getCurationConfig(): CurationConfig {
  return readFromStorage();
}

export function setCurationConfig(next: Partial<CurationConfig> | CurationConfig): CurationConfig {
  const current = readFromStorage();
  const merged: CurationConfig = {
    stations: next.stations !== undefined ? next.stations : current.stations,
    podcasts: next.podcasts !== undefined ? next.podcasts : current.podcasts,
    filters: next.filters !== undefined ? { ...current.filters, ...next.filters } : current.filters,
  };
  return writeToStorage(merged);
}

export function resetCurationConfig(): CurationConfig {
  return writeToStorage(DEFAULT_CURATION_CONFIG);
}

export function loadMigratedCurationPreset(): CurationConfig {
  return writeToStorage(MIGRATED_CURATION_PRESET);
}

export function getContentFilters(): ContentFilters {
  return readFromStorage().filters;
}

export function setContentFilters(patch: Partial<ContentFilters>): ContentFilters {
  const current = readFromStorage();
  return writeToStorage({
    ...current,
    filters: { ...current.filters, ...patch },
  }).filters;
}

export function upsertCustomStation(
  spec: Omit<CustomStationSpec, "id"> & { id?: string },
): CustomStationSpec {
  const current = readFromStorage();
  const normalized = normalizeStationSpec({
    ...spec,
    id: spec.id?.trim() || `custom-${slugify(spec.name)}-${shortHash(spec.streamUrl)}`,
  });
  if (!normalized) {
    throw new Error("Custom station requires a name and stream URL.");
  }
  const nextStations = [
    normalized,
    ...current.stations.filter((s) => s.id !== normalized.id),
  ];
  writeToStorage({ ...current, stations: nextStations });
  return normalized;
}

export function removeCustomStation(id: string): void {
  const current = readFromStorage();
  if (!current.stations.some((s) => s.id === id)) return;
  writeToStorage({
    ...current,
    stations: current.stations.filter((s) => s.id !== id),
  });
}

export function upsertCustomPodcast(
  spec: Omit<CustomPodcastSpec, "id"> & { id?: string },
): CustomPodcastSpec {
  const current = readFromStorage();
  const normalized = normalizePodcastSpec({
    ...spec,
    id: spec.id?.trim() || `custom-pod-${slugify(spec.name)}-${shortHash(spec.feedUrl)}`,
  });
  if (!normalized) {
    throw new Error("Custom podcast requires a name and RSS feed URL.");
  }
  const nextPodcasts = [
    normalized,
    ...current.podcasts.filter((p) => p.id !== normalized.id),
  ];
  writeToStorage({ ...current, podcasts: nextPodcasts });
  return normalized;
}

export function removeCustomPodcast(id: string): void {
  const current = readFromStorage();
  if (!current.podcasts.some((p) => p.id === id)) return;
  writeToStorage({
    ...current,
    podcasts: current.podcasts.filter((p) => p.id !== id),
  });
}

export function onCurationChange(listener: (config: CurationConfig) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCurationConfig(): CurationConfig {
  const [config, setConfig] = useState<CurationConfig>(readFromStorage);
  useEffect(() => {
    setConfig(readFromStorage());
    return onCurationChange(setConfig);
  }, []);
  return config;
}

export function isExcludedContent(
  names: (string | undefined)[],
  tags: string[] = [],
  filtersOverride?: ContentFilters,
): boolean {
  const filters = filtersOverride ?? getContentFilters();
  const cleanNames = names.map((name) => name || "");

  if (
    filters.excludeCommercialFormatNames &&
    cleanNames.some((name) => DASHED_NETWORK_NAME.test(name) || ADVERTISING_NAME.test(name))
  ) {
    return true;
  }

  const termPattern = buildWholeWordRegex(filters.excludedTerms.map(escapeRegExp));
  const patternRegex = buildWholeWordRegex(filters.excludedPatterns);
  if (!termPattern && !patternRegex) return false;

  return [...cleanNames, ...tags].some(
    (text) =>
      Boolean(text) &&
      (Boolean(termPattern?.test(text)) || Boolean(patternRegex?.test(text))),
  );
}

export function isExcludedCountry(
  country?: string,
  countryCode?: string,
  state?: string,
  filtersOverride?: ContentFilters,
): boolean {
  const filters = filtersOverride ?? getContentFilters();
  if (!filters.excludedCountries.length) return false;

  const excludedSet = new Set(filters.excludedCountries.map((c) => c.trim().toLowerCase()));
  const cleanCountry = (country || "").trim().toLowerCase();
  if (cleanCountry && excludedSet.has(cleanCountry)) return true;

  const cleanCode = (countryCode || "").trim().toLowerCase();
  if (cleanCode && excludedSet.has(cleanCode)) return true;

  const cleanState = (state || "").trim().toLowerCase();
  if (cleanState && excludedSet.has(cleanState)) return true;

  return false;
}
