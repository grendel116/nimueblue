import { RADIO_STATION_META, PODCAST_SHOW_META } from "../data/metadata.js";
import { isQualityArtwork, renderHtml } from "../lib/html.js";
import { resolveFaircampSongShare } from "./fairplayer.js";
import { fetchCastopodCatalog } from "./proxy.js";

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

function decodeFunkwhaleShareToken(token) {
  try {
    const raw = String(token || "").startsWith("fw") ? String(token).slice(2) : String(token || "");
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const [releasePart, trackPart] = decoded.split("#");
    const slashIdx = releasePart.indexOf("/");
    if (slashIdx <= 0) return null;
    const podHost = releasePart.slice(0, slashIdx).trim().toLowerCase().replace(/^www\./, "");
    const albumId = Number(releasePart.slice(slashIdx + 1));
    if (
      !podHost ||
      !podHost.includes(".") ||
      !/^[a-z0-9.-]+$/.test(podHost) ||
      podHost === "localhost" ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(podHost) ||
      !Number.isSafeInteger(albumId) ||
      albumId <= 0
    ) {
      return null;
    }
    const trackOrder = trackPart && /^\d+$/.test(trackPart.trim()) ? Number(trackPart.trim()) : 1;
    return { podHost, albumId, trackOrder };
  } catch {
    return null;
  }
}

function decodeFunkwhaleArtistSlug(slug) {
  const clean = String(slug || "").trim();
  if (!clean.startsWith("funkwhale-artist-")) return null;
  const rest = clean.slice("funkwhale-artist-".length);
  const match = rest.match(/^([a-z0-9.-]+)-(\d+)$/i);
  if (!match) return null;
  const podHost = match[1].toLowerCase().replace(/^www\./, "");
  const artistId = Number(match[2]);
  if (
    !podHost ||
    !podHost.includes(".") ||
    podHost === "localhost" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(podHost) ||
    !Number.isSafeInteger(artistId) ||
    artistId <= 0
  ) {
    return null;
  }
  return { podHost, artistId };
}

function formatFunkwhaleArtistCredit(artistCredit, attributedTo) {
  const strip = (s) => String(s || "").replace(/@[a-z0-9.-]+\.[a-z]{2,}$/i, "").trim();
  if (Array.isArray(artistCredit) && artistCredit.length > 0) {
    const names = artistCredit
      .map((c) => strip(c?.credit))
      .filter(Boolean);
    if (names.length > 0) return names.join(", ");
  }
  return strip(attributedTo?.name || attributedTo?.preferred_username || "") || "Unknown Artist";
}

async function resolveFunkwhaleTrack(token, origin) {
  const decoded = decodeFunkwhaleShareToken(token);
  if (!decoded) return null;
  const { podHost, albumId, trackOrder } = decoded;
  const headers = { "User-Agent": "NimueBlueSocialBot/1.0", Accept: "application/json" };
  const [albumRes, tracksRes] = await Promise.all([
    fetch(`https://${podHost}/api/v2/albums/${albumId}`, { headers }),
    fetch(`https://${podHost}/api/v2/tracks?album=${albumId}&playable=true&page_size=100`, {
      headers,
    }),
  ]);
  if (!albumRes.ok) return null;
  const albumJson = await albumRes.json();
  const tracksJson = tracksRes.ok ? await tracksRes.json() : { results: [] };
  const tracks = Array.isArray(tracksJson?.results) ? tracksJson.results : [];
  const matchedTrack =
    tracks.find((t) => Number(t?.position) === trackOrder) ||
    tracks[Math.max(0, trackOrder - 1)] ||
    tracks[0];
  const listenPath = matchedTrack?.listen_url || matchedTrack?.uploads?.[0]?.listen_url || "";
  const audioUrl = listenPath ? new URL(listenPath, `https://${podHost}`).href : "";
  const artist = matchedTrack?.artist_credit?.length
    ? formatFunkwhaleArtistCredit(matchedTrack.artist_credit, matchedTrack.attributed_to)
    : formatFunkwhaleArtistCredit(albumJson?.artist_credit, albumJson?.attributed_to);
  const albumSlug = `funkwhale-${podHost}-${albumId}`;
  const coverUrls = albumJson?.cover?.urls;
  const directArtwork =
    coverUrls?.large_square_crop ||
    coverUrls?.original ||
    coverUrls?.medium_square_crop ||
    "";
  return {
    title: matchedTrack?.title || albumJson?.title || "Track",
    artist,
    album: albumJson?.title || "",
    artwork: coverUrls
      ? `${origin}/funkwhale/cover?pod=${encodeURIComponent(podHost)}&album=${albumId}`
      : "",
    directArtwork,
    audioUrl,
    webUrl: `https://${podHost}/library/albums/${albumId}`,
    appRoute: `/artist/funkwhale/album/${albumSlug}/album-tracks?trackOrder=${trackOrder}`,
  };
}

// Share card details for a Mirlo, Faircamp, or Funkwhale artist, or null when not found
async function resolveMirloArtist(slug, origin) {
  if (slug.startsWith("funkwhale-artist-")) {
    const decoded = decodeFunkwhaleArtistSlug(slug);
    if (!decoded) return null;
    const { podHost, artistId } = decoded;
    const headers = { "User-Agent": "NimueBlueSocialBot/1.0", Accept: "application/json" };
    const [artistRes, albumsRes] = await Promise.all([
      fetch(`https://${podHost}/api/v2/artists/${artistId}`, { headers }),
      fetch(`https://${podHost}/api/v2/albums?artist=${artistId}&playable=true&page_size=10`, {
        headers,
      }),
    ]);
    if (artistRes.status === 404) return null;
    if (!artistRes.ok) throw new Error(`Funkwhale artist lookup answered ${artistRes.status}`);
    const artistJson = await artistRes.json();
    const albumsJson = albumsRes.ok ? await albumsRes.json() : { results: [] };
    const firstAlbum = Array.isArray(albumsJson?.results) ? albumsJson.results[0] : null;
    const name = String(
      artistJson?.name || artistJson?.attributed_to?.name || `Artist ${artistId}`,
    )
      .replace(/@[a-z0-9.-]+\.[a-z]{2,}$/i, "")
      .trim();
    const artwork = artistJson?.cover?.urls
      ? `${origin}/funkwhale/cover?pod=${encodeURIComponent(podHost)}&artist=${artistId}`
      : firstAlbum?.cover?.urls
        ? `${origin}/funkwhale/cover?pod=${encodeURIComponent(podHost)}&album=${firstAlbum.id}`
        : "";
    const directCoverUrls = artistJson?.cover?.urls || firstAlbum?.cover?.urls;
    const directArtwork =
      directCoverUrls?.large_square_crop ||
      directCoverUrls?.original ||
      directCoverUrls?.medium_square_crop ||
      "";
    return {
      name,
      location: `Funkwhale · ${podHost}`,
      artwork,
      directArtwork,
      webUrl: `https://${podHost}/library/artists/${artistId}`,
      appRoute: `/artist/${encodeURIComponent(slug)}/artist-page`,
    };
  }

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

function extractPodcastAudioUrl(xml) {
  const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];
  for (const item of items) {
    const enclosures = item.match(/<enclosure\b[^>]*\/?>/gi) || [];
    for (const enclosure of enclosures) {
      const match = enclosure.match(/\burl=["']([^"']+)["']/i);
      if (match && match[1]) return match[1];
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
  let showMeta = PODCAST_SHOW_META[slug] || null;

  if (!showMeta && slug.startsWith("pod-")) {
    const rawId = slug.slice(4);
    try {
      const records = await fetchCastopodCatalog();
      const matched = records.find(
        (record) =>
          record &&
          ((record.podcastGuid && String(record.podcastGuid).toLowerCase() === rawId) ||
            String(record.id) === rawId),
      );
      if (matched?.title) {
        showMeta = {
          name: matched.title,
          artist: matched.itunesAuthor || matched.itunesOwnerName || matched.title,
          art: matched.imageUrl || "",
          feed: matched.url || "",
          web: matched.link || matched.url || "",
          app: `/podcast/${slug}`,
        };
      }
    } catch (err) {
      console.error(`Castopod lookup failed for ${slug}:`, err);
    }

    if (!showMeta && /^\d+$/.test(rawId)) {
      try {
        const res = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(rawId)}`, {
          headers: { "User-Agent": "NimueBlueSocialBot/1.0", Accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          const item = Array.isArray(data?.results) ? data.results[0] : null;
          if (item?.collectionName) {
            showMeta = {
              name: item.collectionName,
              artist: item.artistName || item.collectionName,
              art: item.artworkUrl600 || item.artworkUrl100 || "",
              feed: item.feedUrl || "",
              web: item.collectionViewUrl || item.feedUrl || "",
              app: `/podcast/${slug}`,
            };
          }
        }
      } catch (err) {
        console.error(`iTunes podcast lookup failed for ${slug}:`, err);
      }
    }
  }

  if (!showMeta) return null;
  if (!includeAudio || !showMeta.feed) return showMeta;
  try {
    const audio = await fetchLatestPodcastAudio(showMeta.feed);
    return { ...showMeta, audio };
  } catch (err) {
    console.error(`Podcast episode lookup failed for ${slug}:`, err);
    return showMeta;
  }
}

export async function handleShare(request, url) {
  const cleanPath = url.pathname.replace(/\/+$/, "");
  const normalizedPath = cleanPath.replace(/^\/listen(?:\/|$)/, "/") || "/";

  let type = "";
  let title = url.searchParams.get("title") || "";
  let artist = url.searchParams.get("artist") || "";
  let album = url.searchParams.get("album") || "";
  let artwork = url.searchParams.get("art") || "";
  let directArtwork = "";
  let audioUrl = url.searchParams.get("audio") || "";
  let webUrl = url.searchParams.get("web") || "";
  let appRoute = url.searchParams.get("app") || "/";
  let trackId = null;

  const funkwhaleTrackMatch = normalizedPath.match(/^\/t\/(fw[A-Za-z0-9_-]+)$/i);
  const faircampTrackMatch = normalizedPath.match(/^\/t\/f([^/]+)$/i);
  const trackMatch = normalizedPath.match(/^\/t\/(\d+)$/i);
  const radioMatch = normalizedPath.match(/^\/r\/([a-z0-9-]+)$/i);
  const podcastMatch = normalizedPath.match(/^\/p\/([a-z0-9-]+)$/i);
  const artistMatch = normalizedPath.match(/^\/art\/([^/]+)$/i);
  let isCustomShare = false;

  if (radioMatch) {
    type = "radio";
    const slug = radioMatch[1].toLowerCase();
    isCustomShare = slug.startsWith("custom-");
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
    isCustomShare = slug.startsWith("custom-pod-");
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
  } else if (funkwhaleTrackMatch) {
    let share;
    try {
      share = await resolveFunkwhaleTrack(funkwhaleTrackMatch[1], url.origin);
    } catch (err) {
      console.error("Funkwhale track metadata lookup failed:", err);
      return new Response("Funkwhale track is temporarily unavailable.", { status: 502 });
    }
    if (!share) {
      return new Response("Funkwhale track is not available for sharing.", { status: 404 });
    }
    type = "funkwhale";
    title = share.title;
    artist = share.artist;
    album = share.album;
    artwork = share.artwork;
    directArtwork = share.directArtwork || "";
    audioUrl = share.audioUrl;
    webUrl = share.webUrl;
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
  } else if (artistMatch) {
    let slug;
    try {
      slug = decodeURIComponent(artistMatch[1]);
    } catch {
      return new Response("Invalid artist identifier.", { status: 400 });
    }
    let share;
    try {
      share = await resolveMirloArtist(slug, url.origin);
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
    directArtwork = share.directArtwork || "";
    audioUrl = "";
    webUrl = share.webUrl;
    appRoute = share.appRoute;
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

  if (!title) title = "Featured Music";

  if ((type === "radio" || type === "podcast") && !isCustomShare && !isQualityArtwork(artwork)) {
    return new Response("This station or discussion has no quality artwork.", { status: 404 });
  }

  const safeArtwork = isQualityArtwork(artwork) ? artwork : "";
  const imageSourceForProxy = (directArtwork && /^https?:\/\//i.test(directArtwork))
    ? directArtwork
    : safeArtwork;
  const proxiedArtwork = imageSourceForProxy
    ? `${url.origin}/image?url=${encodeURIComponent(imageSourceForProxy)}&v=640`
    : "https://grendel116.github.io/nimueblue/preview-v8.png";

  const html = renderHtml({
    title,
    artist,
    album,
    artwork: safeArtwork,
    proxiedArtwork,
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
}
