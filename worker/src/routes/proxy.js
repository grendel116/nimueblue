import { MIRLO_API_ORIGIN, MIRLO_PROXY_CORS } from "../data/metadata.js";
import { isQualityArtwork } from "../lib/html.js";

const CASTOPOD_INDEX_URL = "https://index.castopod.org/podcastindex.json";

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

export async function fetchCastopodCatalog() {
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

function isDiscoverableCastopodPodcast(record, discoveryTerms = []) {
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

  if (!Array.isArray(discoveryTerms) || discoveryTerms.length === 0) {
    return true;
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
  return discoveryTerms.some((term) => searchable.includes(term));
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
  const lookupId = (url.searchParams.get("id") || "").trim().toLowerCase();
  if (lookupId) {
    try {
      const records = await fetchCastopodCatalog();
      const matched = records.find(
        (record) =>
          record &&
          ((record.podcastGuid && String(record.podcastGuid).toLowerCase() === lookupId) ||
            String(record.id) === lookupId),
      );
      return new Response(
        JSON.stringify({ podcasts: matched ? [castopodPodcastResponse(matched)] : [] }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=1800",
          },
        },
      );
    } catch (err) {
      console.error("Castopod Index lookup failed:", err);
      return new Response(JSON.stringify({ podcasts: [] }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    }
  }

  const limit = Number(url.searchParams.get("limit") || "12");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return new Response("Invalid podcast limit.", { status: 400, headers: corsHeaders });
  }
  const termsParam = url.searchParams.get("terms") || "";
  const discoveryTerms = termsParam
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);

  try {
    const records = await fetchCastopodCatalog();
    const podcasts = records
      .filter((record) => isDiscoverableCastopodPodcast(record, discoveryTerms))
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

// Delivers share card artwork in JPEG format for link preview services (Threads, Facebook, Twitter, iMessage).
// Non-JPEG formats (WebP, PNG, GIF) and undersized images (< 200px) are converted to JPEGs (640x640,
// fit: "contain") with the Cloudflare Images binding (IMAGES in wrangler.toml) so social platforms do not discard them.
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
    const buffer = await imageRes.arrayBuffer();

    if (env?.IMAGES) {
      try {
        const jpeg = await env.IMAGES.input(buffer)
          .transform({ width: 640, height: 640, fit: "contain", background: "#0f141c" })
          .output({ format: "image/jpeg", quality: 85 });

        const imageBuffer = await jpeg.image();
        return new Response(imageBuffer, {
          status: 200,
          headers: { ...headers, "Content-Type": "image/jpeg" },
        });
      } catch (transformErr) {
        console.error("Cloudflare Images transform failed:", transformErr);
      }
    }

    return new Response(buffer, {
      status: 200,
      headers: { ...headers, "Content-Type": contentType || "image/jpeg" },
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

export async function handleFunkwhaleCoverProxy(request, url, corsHeaders) {
  const podHost = (url.searchParams.get("pod") || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  const albumId = (url.searchParams.get("album") || "").trim();
  const artistId = (url.searchParams.get("artist") || "").trim();

  const validPod =
    podHost &&
    podHost.includes(".") &&
    !/^\d{1,3}(\.\d{1,3}){3}$/.test(podHost) &&
    podHost !== "localhost" &&
    /^[a-z0-9.-]+$/.test(podHost);
  const targetPath = /^\d+$/.test(albumId)
    ? `/api/v2/albums/${albumId}`
    : /^\d+$/.test(artistId)
      ? `/api/v2/artists/${artistId}`
      : "";

  if (!validPod || !targetPath) {
    return new Response("Invalid Funkwhale cover parameters.", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const cache = globalThis.caches?.default;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    } catch (err) {
      console.warn("Funkwhale cover cache read failed:", err);
    }
  }

  try {
    const metaRes = await fetch(`https://${podHost}${targetPath}`, {
      headers: {
        "User-Agent": "NimueBlueSocialBot/1.0",
        Accept: "application/json",
      },
    });
    if (!metaRes.ok) {
      return new Response("Funkwhale metadata unavailable.", {
        status: metaRes.status,
        headers: corsHeaders,
      });
    }
    const meta = await metaRes.json();
    const urls = meta?.cover?.urls;
    const coverUrl =
      urls?.large_square_crop ||
      urls?.original ||
      urls?.medium_square_crop ||
      urls?.small_square_crop;
    if (!coverUrl || !/^https?:\/\//i.test(coverUrl)) {
      return new Response("Funkwhale cover not found.", {
        status: 404,
        headers: corsHeaders,
      });
    }

    const imageRes = await fetch(coverUrl, {
      headers: {
        "User-Agent": "NimueBlueSocialBot/1.0",
        Accept: "image/*",
      },
    });
    if (!imageRes.ok || !imageRes.body) {
      return new Response("Funkwhale cover image unavailable.", {
        status: imageRes.status || 502,
        headers: corsHeaders,
      });
    }

    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", imageRes.headers.get("content-type") || "image/jpeg");
    headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
    headers.set("Content-Disposition", "inline");

    const response = new Response(
      request.method === "HEAD" ? null : imageRes.body,
      { status: 200, headers },
    );

    if (cache && request.method === "GET") {
      try {
        await cache.put(cacheKey, response.clone());
      } catch (err) {
        console.warn("Funkwhale cover cache write failed:", err);
      }
    }

    return response;
  } catch (err) {
    return new Response(`Error fetching Funkwhale cover: ${err.message}`, {
      status: 502,
      headers: corsHeaders,
    });
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
  if (url.pathname === "/funkwhale/cover") {
    return handleFunkwhaleCoverProxy(request, url, corsHeaders);
  }
  if (url.pathname === "/image" || url.pathname.endsWith("/image")) {
    return handleImageProxy(url, env);
  }
  if (url.pathname.startsWith("/stream/")) {
    return handleStreamProxy(request, url);
  }
  return null;
}
