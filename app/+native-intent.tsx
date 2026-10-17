import { MirloFetchError } from "@/queries/fetch/MirloFetchError";
import { queryClient } from "@/queries/QueryClientWrapper";
import { queryArtist } from "@/queries/queries";
import { openInBrowser } from "@/scripts/openInBrowser";
import * as api from "@/queries/fetch/fetchWrapper";
import {
  fairplayerReleaseSlug,
  fetchFairplayerSongReleaseSlug,
} from "@/queries/fairplayer";

// Artist pages share the site root with routes like /login, so a single
// segment is an artist only if the API says so. Fetching through the query
// client also primes the artist page's cache. Anything but a 404 (offline,
// server error) still goes to the artist page, which shows its own error
async function isArtist(slug: string) {
  try {
    await queryClient.fetchQuery({
      ...queryArtist({ artistSlug: slug }),
      retry: false,
    });
    return true;
  } catch (e) {
    return !(e instanceof MirloFetchError && e.status === 404);
  }
}

// Normalizes app routes to ensure they match defined Expo Router screens.
export function normalizeAppRoute(route: string): string {
  if (!route) return "/";
  let pathOnly = route;
  try {
    const parsed = new URL(route);
    pathOnly =
      parsed.host && (parsed.protocol === "nimueblue:" || parsed.protocol === "mirloblue:")
        ? `/${parsed.host}${parsed.pathname}`
        : parsed.pathname;
  } catch {
    // Already a pathname
  }

  pathOnly = pathOnly.replace(/\/+$/, "") || "/";

  // Match /artist/:artist/album/:album (and normalize any /tracks/:trackId to album-tracks)
  const albumMatch = pathOnly.match(/^\/artist\/([^/]+)\/album\/([^/]+)(?:\/tracks\/[^/]+|\/album-tracks)?$/i);
  if (albumMatch) {
    return `/artist/${albumMatch[1]}/album/${albumMatch[2]}/album-tracks`;
  }

  // Match /artist/:artist (with optional /artist-page)
  const artistMatch = pathOnly.match(/^\/artist\/([^/]+)(?:\/artist-page)?$/i);
  if (artistMatch) {
    return `/artist/${artistMatch[1]}/artist-page`;
  }

  return pathOnly;
}

// Maps incoming links to the app route that shows them.
export async function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  let url: URL;
  try {
    url = new URL(path);
  } catch {
    return normalizeAppRoute(path);
  }

  if (url.protocol === "trackplayer:") return "/now-playing";
  if (url.protocol === "nimueblue:" || url.protocol === "mirloblue:") {
    const hostAndPath = url.host ? `/${url.host}${url.pathname}` : url.pathname;
    return normalizeAppRoute(hostAndPath || "/");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return path;

  const isRecognizedHost =
    url.hostname === "mirlo.space" ||
    url.hostname.endsWith("workers.dev") ||
    url.hostname === "grendel116.github.io";

  if (!isRecognizedHost) return path;

  const cleanPath = url.pathname.replace(/^\/listen(?:\/|$)/, "/").replace(/\/+$/, "") || "/";

  // Handle explicit ?app= query param on share hubs
  const appParam = url.searchParams.get("app");
  if (appParam) return normalizeAppRoute(appParam);

  const faircampTrackMatch = cleanPath.match(/^\/(?:t|track)\/f([^/]+)$/i);
  if (faircampTrackMatch) {
    try {
      const trackId = decodeURIComponent(faircampTrackMatch[1]);
      const albumSlug = await fetchFairplayerSongReleaseSlug(trackId);
      return `/artist/fairplayer/album/${albumSlug}/album-tracks`;
    } catch (err) {
      console.warn("Could not resolve Faircamp share link", err);
      return path;
    }
  }

  const faircampReleaseMatch = cleanPath.match(/^\/(?:f|faircamp)\/([^/]+)(?:\/\d+)?$/i);
  if (faircampReleaseMatch) {
    try {
      const releaseId = decodeURIComponent(faircampReleaseMatch[1]);
      const albumSlug = fairplayerReleaseSlug.encode(releaseId);
      return `/artist/fairplayer/album/${albumSlug}/album-tracks`;
    } catch (err) {
      console.warn("Could not resolve Faircamp release link", err);
      return path;
    }
  }

  // Handle radio station short links (/r/:id or /station/:id)
  const radioMatch = cleanPath.match(/^\/(?:r|radio|station)\/([a-z0-9-]+)$/i);
  if (radioMatch) {
    return `/station/${radioMatch[1]}`;
  }

  // Handle podcast short links (/p/:id or /podcast/:id)
  const podcastMatch = cleanPath.match(/^\/(?:p|podcast)\/([a-z0-9-]+)$/i);
  if (podcastMatch) {
    return `/podcast/${podcastMatch[1]}`;
  }

  // Handle artist short links (/art/:slug) on share hubs; on mirlo.space the first
  // segment is an artist's own slug
  const artistShortMatch = cleanPath.match(/^\/art\/([^/]+)$/i);
  if (artistShortMatch && url.hostname !== "mirlo.space") {
    return `/artist/${artistShortMatch[1]}/artist-page`;
  }

  // Handle track short links (/t/:id or /track/:id) across share hubs and mirlo.space
  const trackMatch = cleanPath.match(/^\/(?:t|track)\/(\d+)$/i);
  if (trackMatch) {
    const trackId = trackMatch[1];
    try {
      const trackData = await queryClient.fetchQuery({
        queryKey: ["track", trackId],
        queryFn: () => api.get(`/v1/tracks/${trackId}`, {}),
        retry: false,
      });
      const trackObj = (trackData as any)?.result || (trackData as any)?.track;
      const artistSlug = trackObj?.trackGroup?.artist?.urlSlug || trackObj?.trackGroup?.artist?.id;
      const albumSlug = trackObj?.trackGroup?.urlSlug || trackObj?.trackGroup?.id;
      if (artistSlug && albumSlug) {
        return `/artist/${artistSlug}/album/${albumSlug}/album-tracks`;
      }
    } catch (err) {
      console.warn("Could not resolve track intent", err);
    }
  }

  // Directly navigate to valid app paths (/artist/..., /station/..., /podcast/...)
  if (
    cleanPath.startsWith("/artist/") ||
    cleanPath.startsWith("/station/") ||
    cleanPath.startsWith("/podcast/")
  ) {
    return normalizeAppRoute(cleanPath);
  }

  if (url.hostname !== "mirlo.space") return path;

  // Handle mirlo.space canonical web URLs
  const [artist, section, album, subSection] = cleanPath
    .split("/")
    .filter(Boolean);
  if (!artist) return "/";
  if (!section || section === "releases") {
    if (await isArtist(artist)) return `/artist/${artist}/artist-page`;
  } else if (section === "release" && album) {
    if (!subSection || subSection === "tracks") {
      return `/artist/${artist}/album/${album}/album-tracks`;
    }
  }

  openInBrowser(path);
  return "";
}
