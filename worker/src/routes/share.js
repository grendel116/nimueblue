import { RADIO_STATION_META, PODCAST_SHOW_META } from "../data/metadata.js";
import { isQualityArtwork, renderHtml } from "../lib/html.js";
import { resolveFaircampSongShare } from "./fairplayer.js";

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
  return null;
}

export async function handleShare(request, url) {
  const cleanPath = url.pathname.replace(/\/+$/, "");
  const normalizedPath = cleanPath.replace(/^\/listen(?:\/|$)/, "/") || "/";

  let type = "";
  let title = url.searchParams.get("title") || "";
  let artist = url.searchParams.get("artist") || "";
  let album = url.searchParams.get("album") || "";
  let artwork = url.searchParams.get("art") || "";
  let audioUrl = url.searchParams.get("audio") || "";
  let webUrl = url.searchParams.get("web") || "";
  let appRoute = url.searchParams.get("app") || "/";
  let trackId = null;

  const faircampTrackMatch = normalizedPath.match(/^\/t\/f([^/]+)$/i);
  const trackMatch = normalizedPath.match(/^\/t\/(\d+)$/i);
  const radioMatch = normalizedPath.match(/^\/r\/([a-z0-9-]+)$/i);
  const podcastMatch = normalizedPath.match(/^\/p\/([a-z0-9-]+)$/i);
  const artistMatch = normalizedPath.match(/^\/art\/([^/]+)$/i);

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

  if ((type === "radio" || type === "podcast") && !isQualityArtwork(artwork)) {
    return new Response("This station or discussion has no quality artwork.", { status: 404 });
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
