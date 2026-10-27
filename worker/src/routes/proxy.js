import { MIRLO_API_ORIGIN, MIRLO_PROXY_CORS } from "../data/metadata.js";
import { isQualityArtwork } from "../lib/html.js";

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

function readCookieValue(setCookie, name) {
  const pair = setCookie.split(";")[0];
  const separator = pair.indexOf("=");
  if (separator === -1 || pair.slice(0, separator).trim() !== name) return "";
  return pair.slice(separator + 1).trim();
}

// Lets the web app talk to Mirlo's API.
export async function proxyMirloApi(request, url) {
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

// Lets the web app read podcast RSS feeds
export async function proxyPodcastFeed(url, corsHeaders) {
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

export async function handlePodcastsApi(url, corsHeaders) {
  const limit = Number(url.searchParams.get("limit") || "6");
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    return new Response("Invalid podcast limit.", { status: 400, headers: corsHeaders });
  }

  try {
    const records = await fetchCastopodCatalog();
    const podcasts = records
      .filter(isDiscoverableCastopodPodcast)
      .sort((a, b) => Number(b.lastUpdate || 0) - Number(a.lastUpdate || 0))
      .slice(0, limit)
      .map(castopodPodcastResponse);

    return new Response(JSON.stringify({ podcasts }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=1800",
      },
    });
  } catch (err) {
    console.error("Castopod Index aggregation failed:", err);
    return new Response(JSON.stringify({ podcasts: [] }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }
}

// Formats every link preview service keeps after a post is published
const SOCIAL_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif"];

// Delivers share card artwork in a format link preview services keep. JPEG, PNG, and GIF pass
// through; other formats, such as Mirlo's WebP covers, become JPEG, because Threads and Facebook
// drop them from a post after publishing
export async function handleImageProxy(url, env) {
  const targetUrl = url.searchParams.get("url");
  if (!targetUrl || !targetUrl.startsWith("http")) {
    return new Response("Missing target image URL", { status: 400 });
  }

  try {
    const imageRes = await fetch(targetUrl, {
      headers: {
        "User-Agent": "NimueBlueSocialBot/1.0",
        Accept: "image/*",
      },
      cf: { cacheTtl: 86400, cacheEverything: true },
    });

    if (!imageRes.ok || !imageRes.body) {
      return new Response("Upstream image fetch failed", { status: imageRes.status || 502 });
    }

    const headers = {
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "Access-Control-Allow-Origin": "*",
    };

    const contentType = (imageRes.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (SOCIAL_IMAGE_TYPES.includes(contentType)) {
      return new Response(imageRes.body, {
        status: 200,
        headers: { ...headers, "Content-Type": contentType },
      });
    }

    const jpeg = await env.IMAGES.input(imageRes.body)
      .transform({ width: 1200, height: 1200, fit: "scale-down", background: "#ffffff" })
      .output({ format: "image/jpeg", quality: 85 });

    return new Response(jpeg.image(), {
      status: 200,
      headers: { ...headers, "Content-Type": "image/jpeg" },
    });
  } catch (err) {
    return new Response(`Error proxying image: ${err.message}`, { status: 502 });
  }
}

export async function handleStreamProxy(request, url) {
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

export async function handleProxy(request, url, env, corsHeaders) {
  if (url.pathname.startsWith("/mirlo/")) {
    return proxyMirloApi(request, url);
  }
  if (url.pathname === "/feed-proxy") {
    return proxyPodcastFeed(url, corsHeaders);
  }
  if (url.pathname === "/api/podcasts") {
    return handlePodcastsApi(url, corsHeaders);
  }
  if (url.pathname === "/image" || url.pathname.endsWith("/image")) {
    return handleImageProxy(url, env);
  }
  if (url.pathname.startsWith("/stream/")) {
    return handleStreamProxy(request, url);
  }
  return null;
}
