/**
 * NIMUEBLUE Social Sharing, Preview Player & Image Proxy Worker
 *
 * Direct, consolidated edge server:
 * 1. Resolves ultra-short routes:
 *    - /t/:id        -> Mirlo track (fetches metadata & cover directly from Mirlo API)
 *    - /art/:slug    -> Mirlo artist (name, location & avatar from Mirlo API)
 *    - /r/:station   -> Independent live radio station
 *    - /p/:podcast   -> Independent movement podcast
 * 2. Directly renders self-contained HTML with embedded OpenGraph / Twitter cards
 *    (Zero external HTML fetching, zero regex patching).
 * 3. Proxies album covers via /image to ensure proper Content-Type: image/webp
 *    (Fixes upstream Mirlo issue #2494 for Threads/Bluesky/Twitter crawlers).
 * 4. Proxies audio streams via /stream to inject CORS headers for browser preview playback.
 */

// Canonical radio stations from queries/radio.ts
const RADIO_STATION_META = {
  kexp: {
    name: "KEXP 90.3 FM",
    artist: "Live from Seattle",
    art: "https://www.kexp.org/media/filer_public/4f/52/4f52b5aa-bd93-4fe7-ab94-2d3258a3804c/kexp_primarylogo_black.png",
    audio: "https://kexp.streamguys1.com/kexp160.aac",
    web: "https://www.kexp.org/playlist/",
    app: "/station/kexp",
  },
  "carbon-sound": {
    name: "Carbon Sound",
    artist: "Live from Minneapolis",
    art: "https://img.apmcdn.org/cb53893e052517a661546c52c2e5401774619f99/uncropped/d82f35-20220711-carbon-sound-png-1826.png",
    audio: "https://carbonsound.stream.publicradio.org/carbonsound.aac",
    web: "https://www.carbonsound.fm/playlist",
    app: "/station/carbon-sound",
  },
  wfmu: {
    name: "WFMU 91.1 FM",
    artist: "Live from Jersey City",
    art: "https://is1-ssl.mzstatic.com/image/thumb/Purple126/v4/12/46/a8/1246a8d2-9aac-c896-868b-c9f78c278c6e/AppIcon-0-0-1x_U007emarketing-0-7-0-0-85-220.jpeg/512x512bb.jpg",
    audio: "https://stream0.wfmu.org/freeform-128k",
    web: "https://wfmu.org/playlists/",
    app: "/station/wfmu",
  },
  "radio-alhara": {
    name: "Radio alHara",
    artist: "Live from Bethlehem",
    art: "https://radioalhara.net/img/radio-alhara-logo-512.png",
    audio: "https://stream.radioalhara.net/ra",
    web: "https://radioalhara.net/",
    app: "/station/radio-alhara",
  },
  "dublin-digital-radio": {
    name: "Dublin Digital Radio (ddr.)",
    artist: "Live from Dublin",
    art: "https://play-lh.googleusercontent.com/mVz6RPCPV4vBX875xKk8tiBJ-z-A2hqbf3QO2SSSYxe_RtyPUumEXlxmETuYbsXHsUw",
    audio: "https://dublin-digital-radio.radiocult.fm/stream",
    web: "https://listen.dublindigitalradio.com",
    app: "/station/dublin-digital-radio",
  },
  ddr: {
    name: "Dublin Digital Radio (ddr.)",
    artist: "Live from Dublin",
    art: "https://play-lh.googleusercontent.com/mVz6RPCPV4vBX875xKk8tiBJ-z-A2hqbf3QO2SSSYxe_RtyPUumEXlxmETuYbsXHsUw",
    audio: "https://dublin-digital-radio.radiocult.fm/stream",
    web: "https://listen.dublindigitalradio.com",
    app: "/station/dublin-digital-radio",
  },
  "resonance-fm": {
    name: "Resonance 104.4 FM",
    artist: "Live from London",
    art: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/2d/ee/1c/2dee1cc1-fec2-52ab-df7a-b5d66f8163d8/AppIcon-1x_U007emarketing-0-11-0-85-220-0.png/512x512bb.jpg",
    audio: "https://stream.resonance.fm/resonance",
    web: "https://www.resonancefm.com",
    app: "/station/resonance-fm",
  },
  refuge: {
    name: "Refuge Worldwide",
    artist: "Live from Berlin",
    art: "https://images.radio.co/station_logos/s3699c5e49.20201221111634.png",
    audio: "https://streaming.radio.co/s3699c5e49/listen",
    web: "https://refugeworldwide.com/radio",
    app: "/station/refuge",
  },
};

// Canonical movement podcasts from queries/podcast.ts
const PODCAST_SHOW_META = {
  "colonial-outcasts": {
    name: "Colonial Outcasts",
    artist: "Greg Stoker & Mark Wayne",
    art: "https://substackcdn.com/image/fetch/w_600,c_limit,f_auto,q_auto:good/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fce66ed85-78f8-46e1-bfc9-e0c267d7e708_3000x3000.png",
    feed: "https://www.rfemedia.com/feed?section=colonial-outcasts",
    web: "https://www.rfemedia.com/s/colonial-outcasts",
    app: "/podcast/colonial-outcasts",
  },
  "black-autonomy": {
    name: "Black Autonomy Podcast",
    artist: "Lorenzo Kom'boa Ervin & JoNina Abron-Ervin",
    art: "https://static.libsyn.com/p/assets/8/4/7/9/847958a34c0d9a21/Black-Autonomy-Profile_100.png",
    feed: "https://blackautonomy.libsyn.com/rss",
    web: "https://blackautonomy.libsyn.com",
    app: "/podcast/black-autonomy",
  },
  "everything-coop": {
    name: "Everything Co-op",
    artist: "Vernon Oakes",
    art: "https://i1.sndcdn.com/avatars-MBD0zlDPR5XKKza6-lLoRig-original.jpg",
    feed: "https://feeds.soundcloud.com/users/soundcloud:users:381264350/sounds.rss",
    web: "https://everything.coop",
    app: "/podcast/everything-coop",
  },

  upstream: {
    name: "Upstream Podcast",
    artist: "Della Z. Duncan & Robert R. Raymond",
    art: "https://static.libsyn.com/p/assets/c/7/e/1/c7e178673bac87a2d959afa2a1bf1c87/avatars-000421042564-bh1xd1-original.jpg",
    feed: "https://rss.libsyn.com/shows/435210/destinations/3632352.xml",
    web: "https://www.upstreampodcast.org",
    app: "/podcast/upstream",
  },
  "millennials-killing-capitalism": {
    name: "Millennials Are Killing Capitalism",
    artist: "MAKC Collective",
    art: "https://static.libsyn.com/p/assets/3/7/e/4/37e4287a44a8f68116c3140a3186d450/MAKC-New-3.png",
    feed: "https://millennialsarekillingcapitalism.libsyn.com/rss",
    web: "https://millennialsarekillingcapitalism.com",
    app: "/podcast/millennials-killing-capitalism",
  },
  "srsly-wrong": {
    name: "Srsly Wrong",
    artist: "Shawn Vulliez & Aaron Moritz",
    art: "https://srslywrong.com/wp-content/uploads/2026/08/369-groceries-scaled.png",
    feed: "https://srslywrong.com/feed/",
    web: "https://srslywrong.com",
    app: "/podcast/srsly-wrong",
  },
};

async function resolveChorusTrackGroup(idOrSlug) {
  if (!idOrSlug) return null;
  const numericId = String(idOrSlug).match(/\d+/)?.[0];
  if (numericId) {
    try {
      const res = await fetch(`https://mirlo.space/v1/trackGroups/${numericId}`, {
        headers: {
          "User-Agent": "NimueBlueSocialBot/1.0",
          Accept: "application/json",
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.result) return json.result;
      }
    } catch (e) {
      console.error("resolveChorusTrackGroup trackGroups API failed:", e);
    }
  }

  try {
    const canimusRes = await fetch("https://mirlo.space/v1/sm/canimus.json", {
      headers: {
        "User-Agent": "NimueBlueSocialBot/1.0",
        Accept: "application/json",
      },
    });
    if (canimusRes.ok) {
      const feed = await canimusRes.json();
      const cleanSlug = String(idOrSlug).toLowerCase().replace(/^(?:chorus-radio-|chorus-podcast-)/, "");
      for (const artist of feed.children || []) {
        for (const album of artist.children || []) {
          const matchUid = album.uid && String(album.uid).toLowerCase() === cleanSlug;
          const matchName = album.name && album.name.toLowerCase().replace(/[^a-z0-9]/g, "-") === cleanSlug;
          if (matchUid || matchName) {
            return {
              title: album.name,
              artist: { name: album.artist || artist.name },
              cover: {
                sizes: {
                  600: album.images?.cover?.src || "",
                },
              },
              tracks: (album.children || []).map((t, idx) => ({
                id: t.uid || idx,
                title: t.name,
                audio: { url: t.src || t.url },
              })),
            };
          }
        }
      }
    }
  } catch (e) {
    console.error("resolveChorusTrackGroup canimus fetch failed:", e);
  }

  return null;
}

// Share card details for a Mirlo or Faircamp artist, or null when not found
async function resolveMirloArtist(slug) {
  if (slug.startsWith("fairplayer-artist-")) {
    const artistName = decodeURIComponent(slug.slice("fairplayer-artist-".length)).trim();
    if (!artistName) return null;
    const searchUrl = new URL("https://fairplayer.band/search/");
    searchUrl.searchParams.set("q", artistName);
    const searchRes = await fetch(searchUrl, {
      headers: { Accept: "application/json" },
    });
    if (!searchRes.ok) return null;
    const items = (await searchRes.json())?.items || [];
    const targetLower = artistName.toLowerCase();
    const artistItem = items.find(
      (item) =>
        item.type === "artist" &&
        String(item.name || "").toLowerCase().trim() === targetLower,
    );
    const albumItem = items.find(
      (item) =>
        item.type === "album" &&
        String(item.artist || "").toLowerCase().trim() === targetLower,
    );
    const matchUid = String(artistItem?.uid || albumItem?.uid || "");
    const domainPart = matchUid.split("@")[1] || "";
    const host = domainPart.split(":")[0];
    const webUrl = host ? `https://${host}` : "https://fairplayer.band";
    return {
      name: artistItem?.name || albumItem?.artist || artistName,
      location: String(artistItem?.description || "").split("\n")[0] || "Faircamp",
      artwork:
        artistItem?.images?.default?.src ||
        albumItem?.images?.default?.src ||
        "",
      webUrl,
      appRoute: `/artist/${encodeURIComponent(slug)}/artist-page`,
    };
  }

  const res = await fetch(`https://mirlo.space/v1/artists/${encodeURIComponent(slug)}`, {
    headers: {
      "User-Agent": "NimueBlueSocialBot/1.0",
      Accept: "application/json",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Mirlo artist lookup answered ${res.status}`);
  const artist = (await res.json())?.result;
  if (!artist?.name) return null;
  const artistSlug = artist.urlSlug || slug;
  return {
    name: artist.name,
    location: artist.location || "",
    artwork:
      artist.avatar?.sizes?.[600] ||
      artist.avatar?.sizes?.[300] ||
      artist.background?.sizes?.[1024] ||
      artist.background?.sizes?.[625] ||
      "",
    webUrl: `https://mirlo.space/${artistSlug}`,
    appRoute: `/artist/${artistSlug}/artist-page`,
  };
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isQualityArtwork(rawUrl) {
  if (typeof rawUrl !== "string" || !/^https?:\/\//i.test(rawUrl)) return false;
  const normalized = rawUrl.trim().toLowerCase();
  if (
    normalized.endsWith(".ico") ||
    normalized.includes("/favicon.ico") ||
    normalized.includes("favicon.ico?") ||
    /(?:^|[^a-z0-9])(?:16x16|32x32|16px|32px)(?:[^a-z0-9]|$)/i.test(normalized) ||
    /[?&](?:w|h|width|height|size)=(?:16|32)(?:&|$)/i.test(normalized)
  ) {
    return false;
  }
  return true;
}

const CASTOPOD_INDEX_URL = "https://index.castopod.org/podcastindex.json";
const PODCAST_DISCOVERY_TERMS = [
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

async function fetchCastopodCatalog() {
  const cache = globalThis.caches?.default;
  const cacheKey = new Request("https://nimueblue-share.workers.dev/internal/castopod-index");
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return cached.json();

  const response = await fetch(CASTOPOD_INDEX_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Castopod Index request failed: ${response.status}`);
  }

  const records = await response.json();
  if (!Array.isArray(records)) {
    throw new Error("Castopod Index returned an invalid catalog.");
  }

  if (cache) {
    try {
      await cache.put(
        cacheKey,
        new Response(JSON.stringify(records), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
          },
        }),
      );
    } catch (err) {
      console.warn("Could not cache Castopod Index catalog:", err);
    }
  }
  return records;
}

function isDiscoverableCastopodPodcast(record) {
  const feedUrlIsHttp =
    typeof record?.url === "string" && /^https?:\/\//i.test(record.url);
  if (
    !record ||
    (record.dead !== 0 && record.dead !== "0") ||
    record.duplicateOf ||
    !record.title ||
    !feedUrlIsHttp ||
    !isQualityArtwork(record.imageUrl)
  ) {
    return false;
  }

  const searchable = [
    record.title,
    record.description,
    record.itunesAuthor,
    ...Array.from({ length: 10 }, (_, index) => record[`category${index + 1}`]),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/<[^>]*>/g, " ")
    .toLowerCase();
  return PODCAST_DISCOVERY_TERMS.some((term) => searchable.includes(term));
}

function castopodPodcastId(record) {
  const stableId = record.podcastGuid || record.id;
  return stableId ? `pod-${String(stableId).toLowerCase()}` : "";
}

function extractPodcastAudioUrl(xml) {
  const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];
  for (const item of items) {
    const enclosures = item.match(/<enclosure\b[^>]*\/?>/gi) || [];
    for (const enclosure of enclosures) {
      const attributes = Object.fromEntries(
        Array.from(
          enclosure.matchAll(/([a-z_:][-a-z0-9_:]*)\s*=\s*(["'])(.*?)\2/gi),
          (match) => [match[1].toLowerCase(), match[3]],
        ),
      );
      const audioUrl = (attributes.url || "").replace(/&amp;/gi, "&");
      const isAudio =
        /^audio\//i.test(attributes.type || "") ||
        /\.(?:mp3|m4a|aac|ogg|opus|wav)(?:$|[?#])/i.test(audioUrl);
      if (isAudio && /^https?:\/\//i.test(audioUrl)) return audioUrl;
    }
  }
  return "";
}

async function fetchLatestPodcastAudio(feedUrl) {
  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent": "NimueBlueSocialBot/1.0",
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`Podcast feed request failed: ${response.status}`);
  }
  return extractPodcastAudioUrl(await response.text());
}

async function resolveRadioStation(slug) {
  const radioBrowserMatch = slug.match(/^rb-([a-f0-9]{32})$/i);
  if (radioBrowserMatch) {
    const compactUuid = radioBrowserMatch[1].toLowerCase();
    const uuid = compactUuid.replace(
      /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
      "$1-$2-$3-$4-$5",
    );
    const response = await fetch(
      `https://de1.api.radio-browser.info/json/stations/byuuid/${uuid}`,
      { headers: { "User-Agent": "NimueBlueSocialBot/1.0", Accept: "application/json" } },
    );
    if (!response.ok) {
      throw new Error(`Radio-Browser station lookup failed: ${response.status}`);
    }
    const stations = await response.json();
    const station = Array.isArray(stations) ? stations[0] : null;
    if (!station) return null;
    const location = [station.state, station.country].filter(Boolean).join(", ") ||
      "Autonomous / Global";
    const name = String(station.name || "").trim();
    return {
      name,
      artist: `Live from ${location}`,
      art: station.favicon || "",
      audio: station.url_resolved || station.url || "",
      web: station.homepage || "",
      app: `/station/${slug}`,
    };
  }

  if (slug.startsWith("chorus-radio-")) {
    const group = await resolveChorusTrackGroup(slug);
    if (!group) return null;
    const firstTrack = Array.isArray(group.tracks)
      ? group.tracks.find((track) => track.isPlayable !== false && (track.id || track.audio?.url))
      : null;
    let audio = "";
    if (firstTrack?.id && !String(firstTrack.id).includes("/")) {
      audio = `https://mirlo.space/v1/tracks/${firstTrack.id}/stream/playlist.m3u8`;
    } else if (firstTrack?.audio?.url) {
      audio = firstTrack.audio.url.startsWith("http")
        ? firstTrack.audio.url
        : `https://mirlo.space${firstTrack.audio.url}`;
    }
    return {
      name: group.title || slug,
      artist: group.artist?.name || "Chorus Radio",
      art: group.cover?.sizes?.[600] || "",
      audio,
      web: "https://mirlo.space",
      app: `/station/${slug}`,
    };
  }

  return null;
}

async function resolvePodcastShow(slug, includeAudio = true) {
  const knownShow = PODCAST_SHOW_META[slug];
  if (knownShow) {
    if (!includeAudio || !knownShow.feed) return knownShow;
    try {
      const audio = await fetchLatestPodcastAudio(knownShow.feed);
      return { ...knownShow, audio };
    } catch (err) {
      console.error(`Podcast episode lookup failed for ${slug}:`, err);
      return knownShow;
    }
  }
  if (!slug.startsWith("pod-")) return null;

  const stableId = slug.slice(4).toLowerCase();
  const catalog = await fetchCastopodCatalog();
  const record = catalog.find(
    (item) =>
      castopodPodcastId(item) === slug ||
      String(item.id).toLowerCase() === stableId ||
      String(item.podcastGuid || "").toLowerCase() === stableId,
  );
  if (!record || !isDiscoverableCastopodPodcast(record)) return null;

  let audio = includeAudio ? record.newestEnclosureUrl || "" : "";
  if (includeAudio && !audio) {
    try {
      audio = await fetchLatestPodcastAudio(record.url);
    } catch (err) {
      console.error(`Podcast episode lookup failed for ${slug}:`, err);
    }
  }

  return {
    name: record.title,
    artist: record.itunesAuthor || record.itunesOwnerName || record.title,
    art: record.imageUrl,
    web: record.link || record.url,
    feed: record.url,
    audio,
    app: `/podcast/${slug}`,
  };
}

function castopodPodcastResponse(record) {
  const lastUpdated = Number(record.lastUpdate);
  return {
    id: record.id,
    podcastGuid: record.podcastGuid || "",
    title: record.title,
    author: record.itunesAuthor || record.itunesOwnerName || "",
    description: String(record.description || "").replace(/<[^>]*>/g, " ").trim(),
    artwork: record.imageUrl,
    feedUrl: record.url,
    webUrl: record.link || record.url,
    lastUpdated:
      Number.isFinite(lastUpdated) && lastUpdated > 0
        ? new Date(lastUpdated * 1000).toISOString()
        : "",
  };
}

const FAIRPLAYER_ROOT = "https://fairplayer.band";

function decodeHtmlAttribute(value) {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function getHtmlAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(
    new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match ? decodeHtmlAttribute(match[1] || match[2] || match[3] || "") : "";
}

function normalizedCatalogDomain(value) {
  try {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const clean = raw.includes("://") ? raw : `https://${raw}`;
    const url = new URL(clean.replace(/:\d+/, "").replace(/:[a-z_][a-z0-9._-]*/i, ""));
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isVerifiedFaircampCatalog(hubHtml, expectedDomain) {
  const anchors = hubHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi);
  for (const [, attributes, content] of anchors) {
    const href = getHtmlAttribute(attributes, "href");
    const domain = normalizedCatalogDomain(href);
    const isVerified = /bg-success|title=["'](?:verified|verificat)/i.test(content);
    if (
      domain === expectedDomain &&
      /faircamp/i.test(content.replace(/<[^>]*>/g, " ")) &&
      isVerified
    ) {
      return href;
    }
  }
  return "";
}

let memoryCatalogMap = null;
let memoryCatalogMapExpiresAt = 0;

async function getVerifiedCatalogUrl(expectedDomain) {
  const now = Date.now();
  if (memoryCatalogMap && memoryCatalogMapExpiresAt > now) {
    return memoryCatalogMap[expectedDomain] || "";
  }

  const cache = globalThis.caches?.default;
  const cacheKey = new Request("https://nimueblue-share.workers.dev/internal/fairplayer-catalogs-map");
  if (cache) {
    try {
      const match = await cache.match(cacheKey);
      if (match) {
        memoryCatalogMap = await match.json();
        memoryCatalogMapExpiresAt = now + 120000;
        return memoryCatalogMap[expectedDomain] || "";
      }
    } catch (e) {
      console.warn("Could not read cached catalog map:", e);
    }
  }

  try {
    const hubResponse = await fetch(`${FAIRPLAYER_ROOT}/hub/`);
    if (!hubResponse.ok) return "";
    const hubHtml = await hubResponse.text();
    const anchors = hubHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi);
    const map = {};
    for (const [, attributes, content] of anchors) {
      const href = getHtmlAttribute(attributes, "href");
      const domain = normalizedCatalogDomain(href);
      const isVerified = /bg-success|title=["'](?:verified|verificat)/i.test(content);
      if (
        domain &&
        /faircamp/i.test(content.replace(/<[^>]*>/g, " ")) &&
        isVerified
      ) {
        map[domain] = href;
      }
    }

    memoryCatalogMap = map;
    memoryCatalogMapExpiresAt = now + 120000;

    if (cache) {
      try {
        await cache.put(
          cacheKey,
          new Response(JSON.stringify(map), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=7200",
            },
          }),
        );
      } catch (e) {
        console.warn("Could not cache catalog map:", e);
      }
    }

    return map[expectedDomain] || "";
  } catch (err) {
    console.error("Failed to fetch verified catalog map:", err);
    return "";
  }
}

function getFairplayerSongElements(html) {
  return [...html.matchAll(/<div\b[^>]*\bclass=["'][^"']*\bsong\b[^"']*["'][^>]*>/gi)]
    .map((match) => match[0]);
}

async function getFaircampArtworkMime(artworkUrl) {
  try {
    const imageResponse = await fetch(artworkUrl, { method: "HEAD" });
    if (imageResponse.ok) {
      const contentType = imageResponse.headers.get("Content-Type") || "";
      if (/^image\/[a-z0-9.+-]+(?:\s*;|$)/i.test(contentType)) {
        return contentType.split(";", 1)[0].trim().toLowerCase();
      }
    }
  } catch (error) {
    console.warn("Could not inspect Faircamp artwork content type:", error);
  }
  return "";
}

function deriveReleaseUrlFromAudioUrl(audioUrl) {
  try {
    const parsed = new URL(audioUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const codecIdx = segments.findIndex((s) =>
      /^(opus|mp3|flac|vorbis|ogg|wav|aac|alac|m4a)(-\d+)?$/i.test(s),
    );
    if (codecIdx >= 2 && /^\d+$/.test(segments[codecIdx - 1])) {
      return `${parsed.origin}/${segments.slice(0, codecIdx - 1).join("/")}/`;
    }
    if (codecIdx >= 1) {
      return `${parsed.origin}/${segments.slice(0, codecIdx).join("/")}/`;
    }
    if (segments.length >= 2) {
      return `${parsed.origin}/${segments.slice(0, -1).join("/")}/`;
    }
  } catch {}
  return undefined;
}

const FAIRCAMP_ACCESS_HREF = /^(?:[^/:#?]+\/)*[^/:#?]+\/[A-Za-z0-9_-]{11}\/(?:index\.html)?$/;

function findFaircampDownloadAccessUrl(html, pageUrl) {
  const anchors = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi);
  for (const [, attributes] of anchors) {
    const href = getHtmlAttribute(attributes, "href");
    if (FAIRCAMP_ACCESS_HREF.test(href)) {
      try {
        return new URL(href, pageUrl).href;
      } catch {}
    }
  }
  return null;
}

async function resolveFaircampShare(releaseId, trackNumber) {
  let cleanId = String(releaseId || "").trim();
  try {
    while (cleanId.includes("%") && /%[0-9a-fA-F]{2}/.test(cleanId)) {
      const next = decodeURIComponent(cleanId);
      if (next === cleanId) break;
      cleanId = next;
    }
  } catch {}
  const idMatch = cleanId.match(/^([^/@\s]+)@([a-z0-9.-]+(?::[a-z0-9._-]+)?)$/i);
  if (!idMatch) return null;
  const domain = normalizedCatalogDomain(`https://${idMatch[2].split(":")[0]}`);
  if (!domain) return null;

  const hubResponse = await fetch(`${FAIRPLAYER_ROOT}/hub/`);
  if (!hubResponse.ok) {
    throw new Error(`Fairplayer hub request failed: ${hubResponse.status}`);
  }
  const hubHtml = await hubResponse.text();
  const sourceUrl = isVerifiedFaircampCatalog(hubHtml, domain);
  if (!sourceUrl) return null;

  const releaseResponse = await fetch(
    `${FAIRPLAYER_ROOT}/player/release/${encodeURIComponent(releaseId)}`,
  );
  if (releaseResponse.status === 404) return null;
  if (!releaseResponse.ok) {
    throw new Error(`Fairplayer release request failed: ${releaseResponse.status}`);
  }
  const releaseHtml = await releaseResponse.text();
  const songs = getFairplayerSongElements(releaseHtml);
  const songTag = songs[trackNumber - 1];
  if (!songTag) return null;

  const rawAudio = getHtmlAttribute(songTag, "data-url");
  const rawArtwork = getHtmlAttribute(songTag, "data-image");
  if (!rawAudio || !rawArtwork) return null;
  let audioUrl;
  let artwork;
  try {
    audioUrl = new URL(rawAudio, FAIRPLAYER_ROOT);
    artwork = new URL(rawArtwork, FAIRPLAYER_ROOT);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(audioUrl.protocol) ||
    !["http:", "https:"].includes(artwork.protocol)
  ) {
    return null;
  }

  const releaseTitle = getHtmlAttribute(songTag, "data-release");
  const trackTitle = getHtmlAttribute(songTag, "data-title");
  const artist = getHtmlAttribute(songTag, "data-artist");
  if (!releaseTitle || !trackTitle || !artist) return null;

  const fairplayerSlug = `fairplayer-${encodeURIComponent(releaseId)}`;
  return {
    title: trackTitle,
    artist,
    album: releaseTitle,
    artwork: artwork.href,
    audioUrl: audioUrl.href,
    sourceUrl,
    imageMime: await getFaircampArtworkMime(artwork.href),
    appRoute: `/artist/fairplayer/album/${fairplayerSlug}/album-tracks`,
  };
}

async function resolveFaircampSongShare(trackId) {
  if (!/^\d+$/.test(trackId)) {
    const syntheticTrack = trackId.match(/^(.+)#(\d+)$/);
    if (!syntheticTrack) return null;
    return resolveFaircampShare(
      syntheticTrack[1],
      Number(syntheticTrack[2]),
    );
  }

  const songResponse = await fetch(`${FAIRPLAYER_ROOT}/player/song/${trackId}`);
  if (songResponse.status === 404) return null;
  if (!songResponse.ok) {
    throw new Error(`Fairplayer track request failed: ${songResponse.status}`);
  }
  const songTag = getFairplayerSongElements(await songResponse.text())[0];
  if (!songTag || getHtmlAttribute(songTag, "data-id") !== trackId) return null;

  const releaseUrl = getHtmlAttribute(songTag, "data-releaseUrl");
  let release;
  try {
    release = new URL(releaseUrl, FAIRPLAYER_ROOT);
  } catch {
    return null;
  }
  const releaseMatch = release.pathname.match(/^\/player\/release\/([^/]+)\/?$/);
  if (release.origin !== FAIRPLAYER_ROOT || !releaseMatch) return null;

  let releaseId;
  try {
    releaseId = decodeURIComponent(releaseMatch[1]);
    while (releaseId.includes("%") && /%[0-9a-fA-F]{2}/.test(releaseId)) {
      const next = decodeURIComponent(releaseId);
      if (next === releaseId) break;
      releaseId = next;
    }
  } catch {
    return null;
  }
  const idMatch = releaseId.match(/^([^/@\s]+)@([a-z0-9.-]+(?::[a-z0-9._-]+)?)$/i);
  if (!idMatch) return null;
  const domain = normalizedCatalogDomain(`https://${idMatch[2].split(":")[0]}`);
  if (!domain) return null;

  const hubResponse = await fetch(`${FAIRPLAYER_ROOT}/hub/`);
  if (!hubResponse.ok) {
    throw new Error(`Fairplayer hub request failed: ${hubResponse.status}`);
  }
  const sourceUrl = isVerifiedFaircampCatalog(await hubResponse.text(), domain);
  if (!sourceUrl) return null;

  const rawAudio = getHtmlAttribute(songTag, "data-url");
  const rawArtwork = getHtmlAttribute(songTag, "data-image");
  if (!rawAudio || !rawArtwork) return null;
  let audioUrl;
  let artwork;
  try {
    audioUrl = new URL(rawAudio, FAIRPLAYER_ROOT);
    artwork = new URL(rawArtwork, FAIRPLAYER_ROOT);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(audioUrl.protocol) ||
    !["http:", "https:"].includes(artwork.protocol)
  ) {
    return null;
  }

  const title = getHtmlAttribute(songTag, "data-title");
  const album = getHtmlAttribute(songTag, "data-release");
  const artist = getHtmlAttribute(songTag, "data-artist");
  if (!title || !album || !artist) return null;

  const fairplayerSlug = `fairplayer-${encodeURIComponent(releaseId)}`;
  return {
    title,
    artist,
    album,
    artwork: artwork.href,
    audioUrl: audioUrl.href,
    sourceUrl,
    imageMime: await getFaircampArtworkMime(artwork.href),
    appRoute: `/artist/fairplayer/album/${fairplayerSlug}/album-tracks`,
  };
}

function renderHtml(meta) {
  const { title, artist, album, artwork, proxiedArtwork, imageMime, audioUrl, webUrl, appRoute, type } = meta;
  const isArtistCard = type === "artist";
  const isLiveLocation = Boolean(artist && artist.toLowerCase().startsWith("live from"));
  // Artist cards carry the artist's name as the title and their location in the artist line
  const label = artist && !isLiveLocation && !isArtistCard ? `${artist} - ${title}` : title;
  const desc = `Listen to ${label} on NIMUEBLUE. Direct artist support with zero ads.`;
  const safeLabel = escapeHtml(label);
  const safeDesc = escapeHtml(desc);
  const safeImage = escapeHtml(proxiedArtwork);
  const safeTitle = escapeHtml(title);
  const safeArtist = escapeHtml(artist);
  const safeAlbum = escapeHtml(album);
  const safeWeb = escapeHtml(webUrl || "https://mirlo.space");
  const webLabel = type === "radio"
    ? "Station Website"
    : type === "podcast"
      ? "Episode Page"
      : type === "faircamp"
        ? "Visit Faircamp Catalog"
        : isArtistCard
          ? "Follow & Support on Mirlo"
          : "Listen & Buy on Mirlo";
  const ogType = type === "track" || type === "faircamp"
    ? "music.song"
    : type === "album"
      ? "music.album"
      : isArtistCard
        ? "profile"
        : "website";
  const safeMime = escapeHtml(imageMime || "image/jpeg");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeLabel} | NIMUEBLUE</title>
    <meta name="description" content="${safeDesc}" />

    <!-- OpenGraph / Social Cards -->
    <meta property="og:title" content="${safeLabel} | NIMUEBLUE" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:image:secure_url" content="${safeImage}" />
    <meta property="og:image:alt" content="${safeLabel}" />
    <meta property="og:image:type" content="${safeMime}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${safeImage}" />
    <meta name="twitter:title" content="${safeLabel} | NIMUEBLUE" />
    <meta name="twitter:description" content="${safeDesc}" />

    <link rel="icon" type="image/png" href="https://grendel116.github.io/nimueblue/logo.png" />

    <style>
      @font-face {
        font-family: "MedievalScroll";
        src: url("https://grendel116.github.io/nimueblue/Medieval-Scroll-of-Wisdom.ttf") format("truetype");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      :root {
        --bg: #070b14;
        --surface: #0d1424;
        --surface-card: #131c31;
        --border: rgba(56, 189, 248, 0.18);
        --border-hover: rgba(0, 210, 255, 0.45);
        --primary: #00d2ff;
        --primary-hover: #38e0ff;
        --primary-glow: rgba(0, 210, 255, 0.25);
        --gold: #facc15;
        --text: #f8fafc;
        --text-muted: #94a3b8;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background-color: var(--bg);
        background-image: radial-gradient(circle at 50% 0%, rgba(0, 210, 255, 0.14) 0%, transparent 65%),
                          radial-gradient(circle at 80% 80%, rgba(56, 189, 248, 0.06) 0%, transparent 50%);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.5;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      header {
        width: 100%;
        border-bottom: 1px solid var(--border);
        background: rgba(13, 20, 36, 0.85);
        backdrop-filter: blur(12px);
        position: sticky;
        top: 0;
        z-index: 10;
      }
      .nav-inner {
        max-width: 720px;
        margin: 0 auto;
        padding: 12px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 5px;
        text-decoration: none;
        color: var(--text);
      }
      .brand img {
        width: 28px;
        height: 28px;
      }
      .brand-text { font-family: "MedievalScroll", sans-serif; font-size: 18px; font-weight: 400; letter-spacing: 0.8px; }
      .brand-highlight { color: var(--primary); }
      .nav-cta {
        font-size: 13px; font-weight: 600; color: var(--primary); text-decoration: none;
        padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border);
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .nav-cta:hover { background: rgba(0, 210, 255, 0.1); border-color: var(--primary); }
      main {
        width: 100%; max-width: 520px; padding: 32px 20px 48px;
        flex: 1; display: flex; flex-direction: column; align-items: center;
      }
      .card {
        width: 100%; background: var(--surface); border: 1px solid var(--border);
        border-radius: 24px; padding: 28px 24px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), 0 0 30px rgba(0, 210, 255, 0.06);
        display: flex; flex-direction: column; align-items: center; text-align: center;
      }
      .artwork-wrap {
        width: 220px; height: 220px; border-radius: ${isArtistCard ? "50%" : "20px"}; margin-bottom: 22px;
        position: relative; background: var(--surface-card); border: 1px solid var(--border);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6), 0 0 24px var(--primary-glow);
        overflow: hidden;
      }
      .artwork-img { width: 100%; height: 100%; object-fit: cover; display: ${artwork ? "block" : "none"}; }
      .artwork-placeholder {
        width: 100%; height: 100%; display: ${artwork ? "none" : "flex"};
        align-items: center; justify-content: center;
        background: radial-gradient(circle at center, #132235 0%, #060b13 100%);
      }
      .artwork-placeholder svg { width: 64px; height: 64px; fill: var(--primary); opacity: 0.85; }
      .track-title { font-family: "MedievalScroll", sans-serif; font-size: 24px; line-height: 1.15; color: var(--text); margin-bottom: 6px; word-break: break-word; }
      .track-artist { font-size: 15px; font-weight: 600; line-height: 1.25; color: var(--primary); margin-bottom: 20px; }
      .track-meta { font-size: 13px; color: var(--text-muted); margin-top: -12px; margin-bottom: 20px; display: ${album ? "block" : "none"}; }
      .player-box { width: 100%; margin-bottom: 24px; display: ${audioUrl ? "flex" : "none"}; align-items: center; gap: 14px; padding: 0 4px; }
      .play-btn {
        width: 44px; height: 44px; border-radius: 50%; background: var(--primary); color: #041019;
        border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        box-shadow: 0 4px 16px var(--primary-glow);
      }
      .play-btn svg { width: 20px; height: 20px; fill: currentColor; }
      .player-progress-wrap { flex: 1; display: flex; align-items: center; }
      .progress-hit-area { width: 100%; padding: 14px 0; cursor: pointer; touch-action: none; user-select: none; }
      .progress-bar-container { width: 100%; height: 8px; background: rgba(255, 255, 255, 0.12); border-radius: 999px; overflow: hidden; position: relative; }
      .progress-bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg, var(--primary), var(--gold)); border-radius: 999px; }
      .actions { width: 100%; display: flex; flex-direction: column; gap: 12px; }
      .btn {
        width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 10px;
        padding: 13px 20px; border-radius: 999px; text-decoration: none; font-size: 15px; font-weight: 700; cursor: pointer;
      }
      .btn-app { background: var(--primary); color: #041019; box-shadow: 0 6px 20px rgba(0, 210, 255, 0.28); border: none; }
      .btn-web { background: var(--surface-card); color: var(--text); border: 1px solid var(--border); }
      footer { width: 100%; text-align: center; padding: 24px 20px; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 13px; margin-top: auto; }
      footer a { color: var(--primary); text-decoration: none; }
    </style>
  </head>
  <body>
    <header>
      <div class="nav-inner">
        <a href="https://grendel116.github.io/nimueblue/" class="brand" title="NIMUEBLUE Home">
          <img src="https://grendel116.github.io/nimueblue/logo.svg" alt="NIMUEBLUE Logo" width="28" height="28" />
          <span class="brand-text">NIMUE<span class="brand-highlight">BLUE</span></span>
        </a>
        <a href="https://grendel116.github.io/nimueblue/" class="nav-cta">About App</a>
      </div>
    </header>

    <main>
      <div class="card">
        <div class="artwork-wrap">
          <img id="cover-img" class="artwork-img" src="${safeImage}" alt="Artwork" />
          <div id="cover-placeholder" class="artwork-placeholder">
            <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
          </div>
        </div>

        <h1 class="track-title">${safeTitle}</h1>
        <div class="track-artist">${safeArtist}</div>
        <div class="track-meta">${safeAlbum}</div>

        <div class="player-box" id="player-container">
          <button class="play-btn" id="play-button" type="button" aria-label="Play audio preview" title="Play preview">
            <svg id="play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            <svg id="pause-icon" viewBox="0 0 24 24" style="display: none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
          </button>
          <div class="player-progress-wrap">
            <div class="progress-hit-area" id="progress-hit-area">
              <div class="progress-bar-container" id="progress-container">
                <div class="progress-bar-fill" id="progress-fill"></div>
              </div>
            </div>
          </div>
          <audio id="audio-player" playsinline preload="none"></audio>
        </div>

        <div class="actions">
          <a class="btn btn-app" id="btn-open-app" href="#">
            <span>Open in App</span>
          </a>
          <a class="btn btn-web" id="btn-open-web" href="${safeWeb}" target="_blank" rel="noopener noreferrer">
            <span>${webLabel}</span>
          </a>
        </div>
      </div>
    </main>

    <footer>
      <p><a href="https://grendel116.github.io/nimueblue/">NIMUEBLUE</a> — Free &amp; open source music player. <a href="https://github.com/grendel116/nimueblue">Source code</a> (AGPL-3.0)</p>
    </footer>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
    <script>
      (function() {
        const appRoute = ${JSON.stringify(appRoute || "/")};
        const rawAudio = ${JSON.stringify(audioUrl || "")};
        const SAMPLE_LIMIT = 10;
        let isPlaying = false, isScrubbing = false, playedSeconds = 0, initialAudioTime = null, animFrameId = null;

        const coverImg = document.getElementById("cover-img");
        const placeholder = document.getElementById("cover-placeholder");
        if (coverImg) {
          coverImg.onerror = function() {
            coverImg.style.display = "none";
            if (placeholder) placeholder.style.display = "flex";
          };
        }

        const btnApp = document.getElementById("btn-open-app");
        if (btnApp) {
          const clean = appRoute.startsWith("/") ? appRoute.slice(1) : appRoute;
          const webAppUrl = "https://grendel116.github.io/nimueblue/app/" + clean;
          // Android opens the installed app, or the web app when it isn't installed;
          // other devices have no app, so they go straight to the web app
          btnApp.href = /android/i.test(navigator.userAgent)
            ? "intent://" + clean + "#Intent;scheme=nimueblue;package=space.mirlo.blue;S.browser_fallback_url=" + encodeURIComponent(webAppUrl) + ";end"
            : webAppUrl;
        }

        const audioPlayer = document.getElementById("audio-player");
        const playBtn = document.getElementById("play-button");
        const playIcon = document.getElementById("play-icon");
        const pauseIcon = document.getElementById("pause-icon");
        const progressFill = document.getElementById("progress-fill");
        const progressHitArea = document.getElementById("progress-hit-area");
        const progressContainer = document.getElementById("progress-container");

        let resolvedAudio = rawAudio;
        if (resolvedAudio && resolvedAudio.indexOf("mirlo.space/v1/tracks/") !== -1) {
          const parts = resolvedAudio.split("/v1/tracks/");
          if (parts[1]) resolvedAudio = window.location.origin + "/stream/" + parts[1];
        }

        let hls = null;
        if (audioPlayer && resolvedAudio) {
          if (resolvedAudio.includes(".m3u8")) {
            if (typeof Hls !== "undefined" && Hls.isSupported()) {
              hls = new Hls({ maxBufferLength: 15, enableWorker: true });
              hls.loadSource(resolvedAudio);
              hls.attachMedia(audioPlayer);
              hls.on(Hls.Events.ERROR, function(event, data) {
                console.warn("HLS Error:", data);
                if (data.fatal) {
                  switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      hls.startLoad();
                      break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                      hls.recoverMediaError();
                      break;
                    default:
                      hls.destroy();
                      break;
                  }
                }
              });
            } else if (audioPlayer.canPlayType("application/vnd.apple.mpegurl")) {
              audioPlayer.src = resolvedAudio;
            }
          } else {
            audioPlayer.src = resolvedAudio;
          }
        }

        function getElapsedSeconds() {
          if (initialAudioTime === null || isNaN(audioPlayer.currentTime)) return 0;
          return Math.max(0, audioPlayer.currentTime - initialAudioTime);
        }

        function updateProgress() {
          if (!isPlaying) return;
          if (!isScrubbing && !audioPlayer.paused) {
            const elapsed = getElapsedSeconds();
            if (elapsed >= SAMPLE_LIMIT) {
              audioPlayer.pause();
              setPlaying(false);
              playedSeconds = SAMPLE_LIMIT;
              progressFill.style.width = "100%";
              return;
            }
            playedSeconds = elapsed;
            progressFill.style.width = Math.min(100, (elapsed / SAMPLE_LIMIT) * 100) + "%";
          }
          animFrameId = requestAnimationFrame(updateProgress);
        }

        function setPlaying(p) {
          isPlaying = p;
          if (playIcon) playIcon.style.display = p ? "none" : "block";
          if (pauseIcon) pauseIcon.style.display = p ? "block" : "none";
          cancelAnimationFrame(animFrameId);
          if (p) {
            animFrameId = requestAnimationFrame(updateProgress);
          }
        }

        audioPlayer.addEventListener("playing", function() {
          if (initialAudioTime === null && !isNaN(audioPlayer.currentTime)) {
            initialAudioTime = audioPlayer.currentTime;
          }
          setPlaying(true);
        });
        audioPlayer.addEventListener("timeupdate", function() {
          if (initialAudioTime === null && !isNaN(audioPlayer.currentTime)) {
            initialAudioTime = audioPlayer.currentTime;
          }
        });
        audioPlayer.addEventListener("pause", function() { setPlaying(false); });
        audioPlayer.addEventListener("ended", function() {
          setPlaying(false);
          playedSeconds = SAMPLE_LIMIT;
          progressFill.style.width = "100%";
        });
        audioPlayer.addEventListener("error", function(err) {
          console.warn("Playback error:", err);
          setPlaying(false);
        });

        if (playBtn && audioPlayer) {
          playBtn.addEventListener("click", function() {
            if (!resolvedAudio) return;
            if (isPlaying) {
              audioPlayer.pause();
            } else {
              if (playedSeconds >= SAMPLE_LIMIT) {
                playedSeconds = 0;
                progressFill.style.width = "0%";
                try {
                  audioPlayer.currentTime = initialAudioTime !== null ? initialAudioTime : 0;
                } catch (e) {}
              }
              audioPlayer.play().catch(function(err) {
                console.warn("Audio play prevented:", err);
                setPlaying(false);
              });
            }
          });
        }

        function seekToClient(clientX) {
          const rect = progressContainer.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          playedSeconds = ratio * SAMPLE_LIMIT;
          progressFill.style.width = (ratio * 100) + "%";
          try {
            const base = initialAudioTime !== null ? initialAudioTime : 0;
            audioPlayer.currentTime = base + playedSeconds;
          } catch (e) {}
        }

        progressHitArea.addEventListener("pointerdown", function(e) {
          if (!resolvedAudio) return;
          isScrubbing = true;
          try { progressHitArea.setPointerCapture(e.pointerId); } catch (err) {}
          seekToClient(e.clientX);
        });
        progressHitArea.addEventListener("pointermove", function(e) {
          if (isScrubbing) seekToClient(e.clientX);
        });
        function onPointerEnd(e) {
          if (!isScrubbing) return;
          isScrubbing = false;
          try { progressHitArea.releasePointerCapture(e.pointerId); } catch (err) {}
          if (!isPlaying) {
            audioPlayer.play().catch(function() {});
          }
        }
        progressHitArea.addEventListener("pointerup", onPointerEnd);
        progressHitArea.addEventListener("pointercancel", onPointerEnd);
      })();
    </script>
  </body>
</html>`;
}

const MIRLO_API_ORIGIN = "https://mirlo.space";

const MIRLO_PROXY_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers":
    "x-mirlo-jwt, x-mirlo-refresh, Content-Length, Content-Range, Accept-Ranges",
  "Access-Control-Max-Age": "86400",
};

function readCookieValue(setCookie, name) {
  const pair = setCookie.split(";")[0];
  const separator = pair.indexOf("=");
  if (separator === -1 || pair.slice(0, separator).trim() !== name) return "";
  return pair.slice(separator + 1).trim();
}

// Lets the web app talk to Mirlo's API. Browsers keep Mirlo's login cookies
// away from other sites, so the app sends its tokens as x-mirlo-* headers and
// receives fresh ones the same way.
async function proxyMirloApi(request, url) {
  const target = new URL(url.pathname.replace(/^\/mirlo/, "") + url.search, MIRLO_API_ORIGIN);

  const headers = new Headers(request.headers);
  const jwt = headers.get("x-mirlo-jwt");
  const refresh = headers.get("x-mirlo-refresh");
  for (const name of ["host", "origin", "referer", "cookie", "accept-encoding", "x-mirlo-jwt", "x-mirlo-refresh"]) {
    headers.delete(name);
  }
  const cookies = [];
  if (jwt) cookies.push(`jwt=${jwt}`);
  if (refresh) cookies.push(`refresh=${refresh}`);
  if (cookies.length) headers.set("cookie", cookies.join("; "));

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "follow",
    });
  } catch (err) {
    console.error("Mirlo API proxy failed:", err);
    return Response.json({ error: "Mirlo is unreachable" }, { status: 502, headers: MIRLO_PROXY_CORS });
  }

  let jwtToken = "";
  let refreshToken = "";
  for (const setCookie of upstream.headers.getSetCookie()) {
    jwtToken = readCookieValue(setCookie, "jwt") || jwtToken;
    refreshToken = readCookieValue(setCookie, "refresh") || refreshToken;
  }

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("set-cookie");
  for (const [name, value] of Object.entries(MIRLO_PROXY_CORS)) responseHeaders.set(name, value);
  if (jwtToken) responseHeaders.set("x-mirlo-jwt", jwtToken);
  if (refreshToken) responseHeaders.set("x-mirlo-refresh", refreshToken);

  const isJson = (upstream.headers.get("content-type") || "").includes("application/json");
  if (isJson && (jwtToken || refreshToken)) {
    const json = await upstream.json();
    json._tokens = { jwt: jwtToken, refresh: refreshToken };
    responseHeaders.delete("content-length");
    responseHeaders.delete("content-encoding");
    return new Response(JSON.stringify(json), { status: upstream.status, headers: responseHeaders });
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

// Lets the web app read podcast RSS feeds, which rarely allow cross-site requests.
async function proxyPodcastFeed(url, corsHeaders) {
  const feedUrl = url.searchParams.get("url") || "";
  if (!/^https?:\/\//i.test(feedUrl)) {
    return new Response("Missing feed URL.", { status: 400, headers: corsHeaders });
  }

  try {
    const feedRes = await fetch(feedUrl, {
      headers: {
        "User-Agent": "NimueBlue/1.0",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      cf: { cacheTtl: 600, cacheEverything: true },
    });
    return new Response(feedRes.body, {
      status: feedRes.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch (err) {
    console.error("Podcast feed proxy failed:", err);
    return new Response("Failed to fetch feed.", { status: 502, headers: corsHeaders });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: url.pathname.startsWith("/mirlo/") ? MIRLO_PROXY_CORS : corsHeaders,
      });
    }

    if (url.pathname.startsWith("/mirlo/")) {
      return proxyMirloApi(request, url);
    }

    if (url.pathname === "/feed-proxy") {
      return proxyPodcastFeed(url, corsHeaders);
    }

    if (url.pathname === "/api/podcasts") {
      const limit = Number(url.searchParams.get("limit") || "6");
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
        return new Response("Invalid podcast limit.", { status: 400, headers: corsHeaders });
      }

      try {
        const catalog = await fetchCastopodCatalog();
        const podcasts = catalog
          .filter(isDiscoverableCastopodPodcast)
          .sort((a, b) => Number(b.lastUpdate || 0) - Number(a.lastUpdate || 0))
          .slice(0, limit)
          .map(castopodPodcastResponse);
        return Response.json(
          { podcasts },
          {
            headers: {
              ...corsHeaders,
              "Cache-Control": "public, max-age=900",
            },
          },
        );
      } catch (err) {
        console.error("Castopod podcast discovery failed:", err);
        return new Response("Podcast discovery is temporarily unavailable.", {
          status: 502,
          headers: corsHeaders,
        });
      }
    }

    if (url.pathname.startsWith("/fairplayer/")) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed.", {
          status: 405,
          headers: { ...corsHeaders, Allow: "GET, HEAD, OPTIONS" },
        });
      }

      if (url.pathname === "/fairplayer/album") {
        let releaseId = (url.searchParams.get("releaseId") || url.searchParams.get("id") || "").trim();
        if (!releaseId && url.searchParams.get("slug")) {
          releaseId = url.searchParams.get("slug").replace(/^fairplayer-/, "");
        }
        try {
          while (releaseId.includes("%") && /%[0-9a-fA-F]{2}/.test(releaseId)) {
            const next = decodeURIComponent(releaseId);
            if (next === releaseId) break;
            releaseId = next;
          }
        } catch {}

        const idMatch = releaseId.match(/^([^/@\s]+)@([a-z0-9.-]+(?::[a-z0-9._-]+)?)$/i);
        if (!idMatch) {
          return new Response("Invalid Faircamp release identifier.", {
            status: 400,
            headers: corsHeaders,
          });
        }

        const domain = normalizedCatalogDomain(`https://${idMatch[2].split(":")[0]}`);
        if (!domain) {
          return new Response("Invalid Faircamp domain.", {
            status: 400,
            headers: corsHeaders,
          });
        }

        const cache = globalThis.caches?.default;
        const cacheKey = new Request(url.toString(), { headers: request.headers });
        if (cache) {
          try {
            const cachedResponse = await cache.match(cacheKey);
            if (cachedResponse) {
              return cachedResponse;
            }
          } catch (cacheErr) {
            console.warn("Could not read Fairplayer album cache:", cacheErr);
          }
        }

        try {
          const catalogUrl = await getVerifiedCatalogUrl(domain);
          if (!catalogUrl) {
            return new Response("Unverified Faircamp domain.", {
              status: 403,
              headers: corsHeaders,
            });
          }

          let cleanBase = catalogUrl.replace(/\/+$/, "");
          const [, subpath] = idMatch[2].split(":");
          if (subpath && !cleanBase.toLowerCase().endsWith(`/${subpath.toLowerCase()}`)) {
            cleanBase = `${cleanBase}/${subpath.replace(/^\/+/, "")}`;
          }
          const expectedReleaseUrl = `${cleanBase}/${encodeURIComponent(idMatch[1])}/`;
          const fairplayerUrl = new URL(
            `/player/release/${encodeURIComponent(releaseId)}`,
            FAIRPLAYER_ROOT,
          );

          // Fetch Fairplayer release HTML and Artist release page in parallel
          const [releaseResponse, pageResponse] = await Promise.all([
            fetch(fairplayerUrl, {
              headers: { Accept: "text/html" },
              cf: { cacheTtl: 1800, cacheEverything: true },
            }),
            fetch(expectedReleaseUrl, {
              headers: {
                Accept: "text/html,application/xhtml+xml",
                "User-Agent": "NimueBlueSocialBot/1.0",
              },
              cf: { cacheTtl: 1800, cacheEverything: true },
            }).catch((pageErr) => {
              console.warn("Could not fetch Faircamp release page:", pageErr);
              return null;
            }),
          ]);

          if (!releaseResponse.ok) {
            return new Response("Fairplayer release unavailable.", {
              status: releaseResponse.status,
              headers: corsHeaders,
            });
          }

          const releaseHtml = await releaseResponse.text();
          let pageHtml = pageResponse && pageResponse.ok ? await pageResponse.text() : null;
          let releaseUrl = expectedReleaseUrl;

          if (!pageHtml) {
            const songs = getFairplayerSongElements(releaseHtml);
            const firstAudio = songs.length ? getHtmlAttribute(songs[0], "data-url") : "";
            const derivedReleaseUrl = deriveReleaseUrlFromAudioUrl(firstAudio);
            if (derivedReleaseUrl && derivedReleaseUrl !== expectedReleaseUrl) {
              try {
                const altPageResponse = await fetch(derivedReleaseUrl, {
                  headers: {
                    Accept: "text/html,application/xhtml+xml",
                    "User-Agent": "NimueBlueSocialBot/1.0",
                  },
                  cf: { cacheTtl: 1800, cacheEverything: true },
                });
                if (altPageResponse.ok) {
                  pageHtml = await altPageResponse.text();
                  releaseUrl = derivedReleaseUrl;
                }
              } catch (altErr) {
                console.warn("Could not fetch alt Faircamp release page:", altErr);
              }
            }
          }

          let shopHtml = null;
          if (pageHtml) {
            const shopUrl = findFaircampDownloadAccessUrl(pageHtml, releaseUrl);
            if (shopUrl) {
              try {
                const shopResponse = await fetch(shopUrl, {
                  headers: {
                    Accept: "text/html,application/xhtml+xml",
                    "User-Agent": "NimueBlueSocialBot/1.0",
                  },
                  cf: { cacheTtl: 1800, cacheEverything: true },
                });
                if (shopResponse.ok) {
                  shopHtml = await shopResponse.text();
                }
              } catch (shopErr) {
                console.warn("Could not fetch Faircamp shop page:", shopErr);
              }
            }
          }

          const payload = JSON.stringify({
            releaseId,
            releaseHtml,
            catalogUrl,
            releaseUrl,
            pageHtml,
            shopHtml,
          });

          const headers = new Headers(corsHeaders);
          headers.set("Content-Type", "application/json; charset=utf-8");
          headers.set("Cache-Control", "public, max-age=7200");

          const response = new Response(request.method === "HEAD" ? null : payload, {
            status: 200,
            headers,
          });

          if (cache && request.method === "GET") {
            try {
              await cache.put(cacheKey, response.clone());
            } catch (putErr) {
              console.warn("Could not cache Fairplayer album response:", putErr);
            }
          }

          return response;
        } catch (err) {
          console.error("Fairplayer album bundle failed:", err);
          return new Response("Fairplayer album unavailable.", {
            status: 502,
            headers: corsHeaders,
          });
        }
      }

      if (url.pathname === "/fairplayer/page") {
        const targetRaw = (url.searchParams.get("url") || "").trim();
        let targetUrl;
        try {
          targetUrl = new URL(targetRaw);
        } catch {
          return new Response("Invalid Faircamp page URL.", {
            status: 400,
            headers: corsHeaders,
          });
        }
        if (
          targetUrl.protocol !== "https:" ||
          (targetUrl.port && targetUrl.port !== "443") ||
          targetUrl.username ||
          targetUrl.password
        ) {
          return new Response("Only HTTPS Faircamp URLs are allowed.", {
            status: 400,
            headers: corsHeaders,
          });
        }
        const domain = normalizedCatalogDomain(targetUrl.href);
        if (!domain) {
          return new Response("Invalid Faircamp domain.", {
            status: 400,
            headers: corsHeaders,
          });
        }
        try {
          const hubResponse = await fetch(`${FAIRPLAYER_ROOT}/hub/`);
          if (!hubResponse.ok) {
            return new Response("Fairplayer hub unavailable.", {
              status: 502,
              headers: corsHeaders,
            });
          }
          const verifiedHref = isVerifiedFaircampCatalog(await hubResponse.text(), domain);
          if (!verifiedHref) {
            return new Response("Unverified Faircamp domain.", {
              status: 403,
              headers: corsHeaders,
            });
          }
          const pageResponse = await fetch(targetUrl.href, {
            method: request.method,
            headers: {
              Accept: "text/html,application/xhtml+xml",
              "User-Agent": "NimueBlueSocialBot/1.0",
            },
          });
          const headers = new Headers(corsHeaders);
          headers.set(
            "Content-Type",
            pageResponse.headers.get("Content-Type") || "text/html; charset=utf-8",
          );
          headers.set("Cache-Control", "public, max-age=600");
          return new Response(request.method === "HEAD" ? null : pageResponse.body, {
            status: pageResponse.status,
            headers,
          });
        } catch (err) {
          console.error("Faircamp page proxy failed:", err);
          return new Response("Faircamp page unavailable.", {
            status: 502,
            headers: corsHeaders,
          });
        }
      }

      let fairplayerUrl;
      let accept = "text/html";
      let cacheDuration = 300;

      if (url.pathname === "/fairplayer/hub") {
        fairplayerUrl = new URL("https://fairplayer.band/hub/");
        cacheDuration = 300;
      } else if (url.pathname === "/fairplayer/player/all/releases") {
        fairplayerUrl = new URL("https://fairplayer.band/player/all/releases");
      } else if (/^\/fairplayer\/player\/song\/\d+$/.test(url.pathname)) {
        const trackId = url.pathname.split("/").pop();
        fairplayerUrl = new URL(
          `/player/song/${trackId}`,
          "https://fairplayer.band",
        );
      } else if (url.pathname === "/fairplayer/search") {
        const query = (url.searchParams.get("q") || "").trim();
        if (query.length < 2 || query.length > 160) {
          return new Response("Search query must contain 2 to 160 characters.", {
            status: 400,
            headers: corsHeaders,
          });
        }
        fairplayerUrl = new URL("https://fairplayer.band/search/");
        fairplayerUrl.searchParams.set("q", query);
        accept = "application/json";
        cacheDuration = 120;
      } else if (url.pathname.startsWith("/fairplayer/player/artist/")) {
        const match = url.pathname.match(/^\/fairplayer\/player\/artist\/([^/]+)$/);
        let artistUid = "";
        try {
          artistUid = match ? decodeURIComponent(match[1]) : "";
        } catch {
          artistUid = "";
        }
        if (!/^[^/@\s]*@[a-z0-9.-]+(?::[a-z0-9._-]+)?$/i.test(artistUid)) {
          return new Response("Invalid Faircamp artist identifier.", {
            status: 400,
            headers: corsHeaders,
          });
        }
        fairplayerUrl = new URL(
          `/player/artist/${encodeURIComponent(artistUid)}`,
          "https://fairplayer.band",
        );
        cacheDuration = 300;
      } else {
        const match = url.pathname.match(/^\/fairplayer\/player\/release\/([^/]+)$/);
        let releaseId = "";
        try {
          releaseId = match ? decodeURIComponent(match[1]) : "";
        } catch {
          releaseId = "";
        }
        if (!/^[^/@\s]+@[a-z0-9.-]+(?::[a-z0-9._-]+)?$/i.test(releaseId)) {
          return new Response("Invalid Faircamp release identifier.", {
            status: 400,
            headers: corsHeaders,
          });
        }
        fairplayerUrl = new URL(
          `/player/release/${encodeURIComponent(releaseId)}`,
          "https://fairplayer.band",
        );
        cacheDuration = 300;
      }

      try {
        const fairplayerResponse = await fetch(fairplayerUrl, {
          method: request.method,
          headers: { Accept: accept },
        });
        const headers = new Headers(corsHeaders);
        headers.set(
          "Content-Type",
          fairplayerResponse.headers.get("Content-Type") || "text/html; charset=utf-8",
        );
        headers.set("Cache-Control", `public, max-age=${cacheDuration}`);
        headers.set("Vary", "Accept");
        return new Response(request.method === "HEAD" ? null : fairplayerResponse.body, {
          status: fairplayerResponse.status,
          headers,
        });
      } catch (error) {
        console.error("Fairplayer catalog request failed:", error);
        return new Response("Fairplayer catalog is temporarily unavailable.", {
          status: 502,
          headers: corsHeaders,
        });
      }
    }

    // Route: Image Proxy (fixes upstream Mirlo issue #2494 for social bots)
    if (url.pathname === "/image" || url.pathname.endsWith("/image")) {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl || !targetUrl.startsWith("http")) {
        return new Response("Missing target image URL", { status: 400 });
      }

      try {
        const imageRes = await fetch(targetUrl, {
          headers: {
            "User-Agent": "NimueBlueSocialBot/1.0",
            Accept: "image/webp,image/jpeg,image/png,*/*",
          },
        });

        if (!imageRes.ok) {
          return new Response("Upstream image fetch failed", { status: imageRes.status });
        }

        let contentType = imageRes.headers.get("content-type") || "";
        if (!contentType || contentType.startsWith("application/octet-stream") || contentType.startsWith("binary/octet-stream")) {
          const lower = targetUrl.toLowerCase();
          if (lower.includes(".webp")) contentType = "image/webp";
          else if (lower.includes(".png")) contentType = "image/png";
          else if (lower.includes(".jpg") || lower.includes(".jpeg")) contentType = "image/jpeg";
          else contentType = "image/jpeg";
        }

        const headers = new Headers();
        headers.set("Content-Type", contentType);
        headers.set("Content-Disposition", "inline");
        headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
        headers.set("Access-Control-Allow-Origin", "*");

        return new Response(imageRes.body, {
          status: 200,
          headers,
        });
      } catch (err) {
        return new Response(`Error proxying image: ${err.message}`, { status: 502 });
      }
    }

    // Route: Audio Stream Proxy (adds CORS headers so HLS.js works in all browsers)
    if (url.pathname.startsWith("/stream/")) {
      const streamPath = url.pathname.replace(/^\/stream\//, "");
      const upstreamUrl = `https://mirlo.space/v1/tracks/${streamPath}`;

      try {
        const fetchHeaders = {
          "User-Agent": "NimueBlueSocialBot/1.0",
        };
        const range = request.headers.get("range");
        if (range) fetchHeaders["Range"] = range;

        const streamRes = await fetch(upstreamUrl, {
          headers: fetchHeaders,
        });

        if (!streamRes.ok && streamRes.status !== 206) {
          return new Response("Upstream stream fetch failed", { status: streamRes.status });
        }

        const headers = new Headers(streamRes.headers);
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

        if (url.pathname.endsWith(".m3u8")) {
          headers.set("Content-Type", "application/vnd.apple.mpegurl");
        } else if (url.pathname.endsWith(".ts")) {
          headers.set("Content-Type", "video/mp2t");
        }

        return new Response(streamRes.body, {
          status: streamRes.status,
          headers,
        });
      } catch (err) {
        return new Response(`Stream proxy error: ${err.message}`, { status: 502 });
      }
    }

    // Route: Web Player & Social Previews
    const cleanPath = url.pathname.replace(/\/+$/, "");
    const normalizedPath = cleanPath.replace(/^\/listen(?:\/|$)/, "/") || "/";

    let type = (url.searchParams.get("type") || "").toLowerCase();
    let title = url.searchParams.get("title") || "";
    let artist = url.searchParams.get("artist") || "";
    let album = url.searchParams.get("album") || "";
    let artwork = url.searchParams.get("art") || "";
    let resolvedImageMime = "";
    let audioUrl = url.searchParams.get("audio") || "";
    let webUrl = url.searchParams.get("web") || "";
    let appRoute = url.searchParams.get("app") || "/";
    let trackId = url.searchParams.get("id");

    // Route matching for ultra-short paths
    const faircampMatch = normalizedPath.match(/^\/f\/([^/]+)(?:\/(\d+))?$/i);
    const faircampTrackMatch = normalizedPath.match(/^\/(?:t|track)\/f([^/]+)$/i);
    const trackMatch = normalizedPath.match(/^\/(?:t|track)\/(\d+)$/i);
    const radioMatch = normalizedPath.match(/^\/(?:r|radio|station)\/([a-z0-9-]+)$/i);
    const podcastMatch = normalizedPath.match(/^\/(?:p|podcast)\/([a-z0-9-]+)$/i);
    const albumMatch = normalizedPath.match(/^\/(?:a|album|release)\/([a-z0-9-]+)$/i);
    const artistMatch = normalizedPath.match(/^\/art\/([^/]+)$/i);

    let chorusSlug = null;
    let trackGroupId = null;

    if (radioMatch) {
      type = "radio";
      const slug = radioMatch[1].toLowerCase();
      let meta = RADIO_STATION_META[slug];
      if (!meta) {
        try {
          meta = await resolveRadioStation(slug);
        } catch (err) {
          console.error("Radio metadata lookup failed:", err);
          return new Response("Unable to resolve radio station metadata.", { status: 502 });
        }
      }
      if (meta) {
        if (!title) title = meta.name;
        if (!artist) artist = meta.artist;
        if (!artwork) artwork = meta.art;
        if (!audioUrl) audioUrl = meta.audio;
        if (!webUrl) webUrl = meta.web;
        if (!appRoute || appRoute === "/") appRoute = meta.app;
      }
      if (!appRoute || appRoute === "/") appRoute = `/station/${slug}`;
      if (!title) {
        title = slug
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
      }
    } else if (podcastMatch) {
      type = "podcast";
      const slug = podcastMatch[1].toLowerCase();
      let meta;
      try {
        meta = await resolvePodcastShow(slug, !audioUrl);
      } catch (err) {
        console.error("Podcast metadata lookup failed:", err);
        return new Response("Unable to resolve podcast metadata.", { status: 502 });
      }
      if (meta) {
        if (!title) title = meta.name;
        if (!artist) artist = meta.artist;
        if (!artwork) artwork = meta.art;
        if (!audioUrl) audioUrl = meta.audio;
        if (!webUrl) webUrl = meta.web;
        if (!appRoute || appRoute === "/") appRoute = meta.app;
      }
      if (!appRoute || appRoute === "/") appRoute = `/podcast/${slug}`;
      if (!title) {
        title = slug
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
      }
    } else if (faircampMatch) {
      let releaseId;
      try {
        releaseId = decodeURIComponent(faircampMatch[1]);
      } catch {
        return new Response("Invalid Faircamp release identifier.", { status: 400 });
      }
      const trackNumber = Number(faircampMatch[2] || "1");
      if (!Number.isSafeInteger(trackNumber) || trackNumber < 1) {
        return new Response("Invalid Faircamp track number.", { status: 400 });
      }
      let share;
      try {
        share = await resolveFaircampShare(releaseId, trackNumber);
      } catch (err) {
        console.error("Faircamp share metadata lookup failed:", err);
        return new Response("Faircamp release is temporarily unavailable.", { status: 502 });
      }
      if (!share) {
        return new Response("Faircamp release is not available for sharing.", { status: 404 });
      }
      type = "faircamp";
      title = share.title;
      artist = share.artist;
      album = share.album;
      artwork = share.artwork;
      audioUrl = share.audioUrl;
      webUrl = share.sourceUrl;
      appRoute = share.appRoute;
    } else if (faircampTrackMatch) {
      let fairplayerTrackId;
      try {
        fairplayerTrackId = decodeURIComponent(faircampTrackMatch[1]);
      } catch {
        return new Response("Invalid Faircamp track identifier.", { status: 400 });
      }
      let share;
      try {
        share = await resolveFaircampSongShare(fairplayerTrackId);
      } catch (err) {
        console.error("Faircamp track metadata lookup failed:", err);
        return new Response("Faircamp track is temporarily unavailable.", { status: 502 });
      }
      if (!share) {
        return new Response("Faircamp track is not available for sharing.", { status: 404 });
      }
      type = "faircamp";
      title = share.title;
      artist = share.artist;
      album = share.album;
      artwork = share.artwork;
      audioUrl = share.audioUrl;
      webUrl = share.sourceUrl;
      appRoute = share.appRoute;
      resolvedImageMime = share.imageMime;
    } else if (artistMatch) {
      let slug;
      try {
        slug = decodeURIComponent(artistMatch[1]);
      } catch {
        return new Response("Invalid artist identifier.", { status: 400 });
      }
      let share;
      try {
        share = await resolveMirloArtist(slug);
      } catch (err) {
        console.error("Mirlo artist lookup failed:", err);
        return new Response("Mirlo artist is temporarily unavailable.", { status: 502 });
      }
      if (!share) {
        return new Response("No Mirlo artist by that name.", { status: 404 });
      }
      type = "artist";
      title = share.name;
      artist = share.location;
      album = "";
      artwork = share.artwork;
      audioUrl = "";
      webUrl = share.webUrl;
      appRoute = share.appRoute;
    } else if (albumMatch) {
      type = "album";
      const slug = albumMatch[1].toLowerCase();
      chorusSlug = slug;
      const idMatch = slug.match(/^\d+$/);
      if (idMatch) trackGroupId = idMatch[0];
    } else if (trackMatch) {
      type = "track";
      trackId = trackMatch[1];
    } else if (!type) {
      type = "track";
    }

    // Resolve Mirlo track metadata directly when track ID is present
    if (trackId && type === "track" && (!title || !artwork)) {
      try {
        const trackRes = await fetch(`https://mirlo.space/v1/tracks/${trackId}`, {
          headers: {
            "User-Agent": "NimueBlueSocialBot/1.0",
            Accept: "application/json",
          },
        });
        if (trackRes.ok) {
          const json = await trackRes.json();
          const trackObj = json?.result || json?.track;
          if (trackObj) {
            title = trackObj.title || title;
            artist = trackObj.trackGroup?.artist?.name || artist;
            album = trackObj.trackGroup?.title || album;
            const cover = trackObj.trackGroup?.cover;
            const fetchedArt =
              cover?.sizes?.[600] ||
              cover?.sizes?.[300] ||
              cover?.sizes?.[120] ||
              (typeof cover === "string" ? cover : "");
            if (fetchedArt) artwork = fetchedArt;

            const artistSlug = trackObj.trackGroup?.artist?.urlSlug;
            const albumSlug = trackObj.trackGroup?.urlSlug;
            if (artistSlug && albumSlug) {
              appRoute = `/artist/${artistSlug}/album/${albumSlug}/album-tracks`;
              webUrl = `https://mirlo.space/${artistSlug}/release/${albumSlug}/tracks/${trackId}`;
            }
            audioUrl = `https://mirlo.space/v1/tracks/${trackId}/stream/playlist.m3u8`;
          }
        }
      } catch (err) {
        console.error("Upstream Mirlo API fetch failed:", err);
      }
    }

    // Resolve federated Chorus broadcasts, podcasts, and releases procedurally
    if ((trackGroupId || chorusSlug) && (!title || !artwork || !audioUrl)) {
      try {
        const groupObj = await resolveChorusTrackGroup(trackGroupId || chorusSlug);
        if (groupObj) {
          title = groupObj.title || title;
          if (groupObj.artist?.name) {
            artist = groupObj.artist.name;
          }
          album = groupObj.title || album;
          const cover = groupObj.cover;
          const fetchedArt =
            cover?.sizes?.[600] ||
            cover?.sizes?.[300] ||
            cover?.sizes?.[120] ||
            (typeof cover === "string" ? cover : "");
          if (fetchedArt) artwork = fetchedArt;

          const artistSlug = groupObj.artist?.urlSlug;
          const albumSlug = groupObj.urlSlug;
          if (artistSlug && albumSlug) {
            appRoute = `/artist/${artistSlug}/album/${albumSlug}/album-tracks`;
            webUrl = `https://mirlo.space/${artistSlug}/release/${albumSlug}`;
          }

          if (!audioUrl && Array.isArray(groupObj.tracks) && groupObj.tracks.length > 0) {
            const playableTrack =
              groupObj.tracks.find((t) => t.isPlayable !== false && (t.id || t.audio?.url)) ||
              groupObj.tracks[0];
            if (playableTrack) {
              if (playableTrack.id && !String(playableTrack.id).includes("/")) {
                audioUrl = `https://mirlo.space/v1/tracks/${playableTrack.id}/stream/playlist.m3u8`;
              } else if (playableTrack.audio?.url) {
                audioUrl = playableTrack.audio.url.startsWith("http")
                  ? playableTrack.audio.url
                  : `https://mirlo.space${playableTrack.audio.url}`;
              }
            }
          }
        }
      } catch (err) {
        console.error("Procedural Chorus resolution failed:", err);
      }
    }

    if (!title) title = "Featured Music";

    if ((type === "radio" || type === "podcast") && !isQualityArtwork(artwork)) {
      return new Response("This station or discussion has no quality artwork.", { status: 404 });
    }

    let imageMime = resolvedImageMime || "image/jpeg";
    if (artwork && !resolvedImageMime) {
      const lower = artwork.toLowerCase();
      if (lower.includes(".webp")) imageMime = "image/webp";
      else if (lower.includes(".png")) imageMime = "image/png";
      else if (lower.includes(".jpg") || lower.includes(".jpeg")) imageMime = "image/jpeg";
    }

    const proxiedArtwork = artwork
      ? `${url.origin}/image?url=${encodeURIComponent(artwork)}`
      : "https://grendel116.github.io/nimueblue/preview-v8.png";

    const html = renderHtml({
      title,
      artist,
      album,
      artwork,
      proxiedArtwork,
      imageMime,
      audioUrl,
      webUrl,
      appRoute,
      type,
    });

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  },
};
