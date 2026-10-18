export const FAIRPLAYER_ROOT = "https://fairplayer.band";

export function decodeHtmlAttribute(value) {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

export function getHtmlAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(
    new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match ? decodeHtmlAttribute(match[1] || match[2] || match[3] || "") : "";
}

export function normalizedCatalogDomain(value) {
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

export function isVerifiedFaircampCatalog(hubHtml, expectedDomain) {
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

export async function getVerifiedCatalogUrl(expectedDomain) {
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

export function getFairplayerSongElements(html) {
  return [...html.matchAll(/<div\b[^>]*\bclass=["'][^"']*\bsong\b[^"']*["'][^>]*>/gi)]
    .map((match) => match[0]);
}

export async function getFaircampArtworkMime(artworkUrl) {
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

export function deriveReleaseUrlFromAudioUrl(audioUrl) {
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

export function findFaircampDownloadAccessUrl(html, pageUrl) {
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

export function parseFaircampPageTracks(pageHtml, releaseUrl) {
  if (!pageHtml || !releaseUrl) return [];
  const tracks = [];
  const titles = [];
  const titleRegex = /<a[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let titleMatch;
  while ((titleMatch = titleRegex.exec(pageHtml)) !== null) {
    const t = titleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (t) titles.push(t);
  }

  const audioRegex = /<audio\b[^>]*>([\s\S]*?)<\/audio>/gi;
  let audioMatch;
  let idx = 0;
  while ((audioMatch = audioRegex.exec(pageHtml)) !== null) {
    const audioInner = audioMatch[1];
    const sourceRegex = /<source\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
    let preferredSrc = "";
    let sMatch;
    while ((sMatch = sourceRegex.exec(audioInner)) !== null) {
      const src = sMatch[1];
      if (!preferredSrc || /\.opus(?:[?#]|$)/i.test(src)) {
        preferredSrc = src;
        if (/\.opus(?:[?#]|$)/i.test(src)) break;
      }
    }

    if (preferredSrc) {
      try {
        const fullUrl = new URL(preferredSrc, releaseUrl).href;
        tracks.push({
          order: idx + 1,
          title: titles[idx] || `Track ${idx + 1}`,
          url: fullUrl,
        });
      } catch {}
    }
    idx++;
  }
  return tracks;
}

export function reconcileFaircampReleaseTracks(releaseHtml, pageHtml, releaseUrl) {
  if (!releaseHtml || !pageHtml || !releaseUrl) return releaseHtml;
  const pageTracks = parseFaircampPageTracks(pageHtml, releaseUrl);
  if (!pageTracks.length) return releaseHtml;

  return releaseHtml.replace(
    /(<div\b[^>]*\bclass=["'][^"']*\bsong\b[^"']*["'][^>]*>)/gi,
    (tag) => {
      const title = getHtmlAttribute(tag, "data-title");
      if (!title) return tag;
      const cleanTitle = title.trim().toLowerCase();
      const matched = pageTracks.find(
        (pt) => pt.title.toLowerCase() === cleanTitle,
      );
      if (matched && matched.url) {
        return tag.replace(
          /(data-url=["'])([^"']*)(["'])/i,
          `$1${matched.url}$3`,
        );
      }
      return tag;
    },
  );
}

export async function resolveFaircampShare(releaseId, trackNumber) {
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

  let rawAudio = getHtmlAttribute(songTag, "data-url");
  const rawArtwork = getHtmlAttribute(songTag, "data-image");
  if (!rawAudio || !rawArtwork) return null;

  const trackTitle = getHtmlAttribute(songTag, "data-title");
  let cleanBase = sourceUrl.replace(/\/+$/, "");
  const [, subpath] = idMatch[2].split(":");
  if (subpath && !cleanBase.toLowerCase().endsWith(`/${subpath.toLowerCase()}`)) {
    cleanBase = `${cleanBase}/${subpath.replace(/^\/+/, "")}`;
  }
  const pageReleaseUrl = `${cleanBase}/${encodeURIComponent(idMatch[1])}/`;
  try {
    const pageResponse = await fetch(pageReleaseUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "NimueBlueSocialBot/1.0",
      },
      cf: { cacheTtl: 1800, cacheEverything: true },
    });
    if (pageResponse.ok) {
      const pageHtml = await pageResponse.text();
      const pageTracks = parseFaircampPageTracks(pageHtml, pageReleaseUrl);
      const cleanTitle = (trackTitle || "").trim().toLowerCase();
      const matched = pageTracks.find((pt) => pt.title.toLowerCase() === cleanTitle);
      if (matched && matched.url) {
        rawAudio = matched.url;
      }
    }
  } catch {}

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

export async function resolveFaircampSongShare(trackId) {
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

export async function handleFairplayer(request, url, corsHeaders) {
  if (url.pathname === "/fairplayer/album") {
    let releaseId = (url.searchParams.get("releaseId") || "").trim();
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
    const cacheUrl = new URL(url.toString());
    cacheUrl.searchParams.set("_v", "2");
    const cacheKey = new Request(cacheUrl.toString(), { headers: request.headers });
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

      const reconciledReleaseHtml = reconcileFaircampReleaseTracks(
        releaseHtml,
        pageHtml,
        releaseUrl,
      );

      const payload = JSON.stringify({
        releaseId,
        releaseHtml: reconciledReleaseHtml,
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

  // Route: /fairplayer/artist (Endpoint to resolve and bundle Faircamp artist metadata)
  if (url.pathname === "/fairplayer/artist") {
    const query = (url.searchParams.get("query") || url.searchParams.get("slug") || url.searchParams.get("name") || "").trim();
    const artistId = url.searchParams.get("id");
    if (!query && !artistId) {
      return new Response(JSON.stringify({ error: "Missing artist query or id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const searchQuery = query || artistId;
      const searchUrl = new URL(`/search?q=${encodeURIComponent(searchQuery)}`, FAIRPLAYER_ROOT);
      const searchRes = await fetch(searchUrl, {
        headers: { Accept: "application/json" },
        cf: { cacheTtl: 300, cacheEverything: true },
      });

      if (!searchRes.ok) {
        return new Response(JSON.stringify({ error: "Fairplayer search unavailable" }), {
          status: searchRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const searchJson = await searchRes.json();
      const items = searchJson.items || [];
      const targetLower = searchQuery.toLowerCase().trim();
      const artistItem =
        items.find((i) => i.type === "artist" && i.name?.toLowerCase().trim() === targetLower) ||
        items.find((i) => i.type === "artist" && i.name?.toLowerCase().includes(targetLower)) ||
        items.find((i) => i.type === "artist");

      if (!artistItem) {
        return new Response(JSON.stringify({ error: "Artist not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let artistDetail = null;
      if (artistItem.uid) {
        const detailUrl = new URL(`/player/artist/${encodeURIComponent(artistItem.uid)}`, FAIRPLAYER_ROOT);
        const detailRes = await fetch(detailUrl, {
          headers: { Accept: "application/json, text/html" },
          cf: { cacheTtl: 300, cacheEverything: true },
        });
        if (detailRes.ok) {
          const ct = detailRes.headers.get("Content-Type") || "";
          if (ct.includes("json")) {
            artistDetail = await detailRes.json();
          }
        }
      }

      const payload = {
        id: artistId ? Number(artistId) : undefined,
        uid: artistItem.uid,
        name: artistItem.name,
        urlSlug: `fairplayer-${encodeURIComponent(artistItem.name.toLowerCase().replace(/\s+/g, "-"))}`,
        avatar: artistItem.avatar || undefined,
        releases: artistDetail?.releases || [],
        links: artistDetail?.links || [],
      };

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=600",
        },
      });
    } catch (err) {
      console.error("Fairplayer artist resolution error:", err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    fairplayerUrl = new URL(`${FAIRPLAYER_ROOT}/hub/`);
    cacheDuration = 300;
  } else if (url.pathname === "/fairplayer/player/all/releases") {
    fairplayerUrl = new URL(`${FAIRPLAYER_ROOT}/player/all/releases`);
  } else if (/^\/fairplayer\/player\/song\/\d+$/.test(url.pathname)) {
    const trackId = url.pathname.split("/").pop();
    fairplayerUrl = new URL(
      `/player/song/${trackId}`,
      FAIRPLAYER_ROOT,
    );
  } else if (url.pathname === "/fairplayer/search") {
    const query = (url.searchParams.get("q") || "").trim();
    if (query.length < 2 || query.length > 160) {
      return new Response("Search query must contain 2 to 160 characters.", {
        status: 400,
        headers: corsHeaders,
      });
    }
    fairplayerUrl = new URL(`${FAIRPLAYER_ROOT}/search/`);
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
      FAIRPLAYER_ROOT,
    );
    cacheDuration = 300;
  } else {
    return new Response("Not found.", { status: 404, headers: corsHeaders });
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
