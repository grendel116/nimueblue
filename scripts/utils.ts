import { API_ROOT } from "@/constants/api-root";
import { getTrackPlaysSync, isTrackDisabledSync } from "@/scripts/trackPlayUtils";
import { findDownload } from "@/scripts/downloadManager";
import type { TrackType } from "react-native-track-player";

// Mirlo serves every track's audio as an HLS playlist at this path.
// List endpoints (wishlist, collection, favorites) omit audio.url, so derive it from the id.
export function trackStreamPath(trackId: number | string): string {
  return `/v1/tracks/${trackId}/stream/playlist.m3u8`;
}

/**
 * Validates that an artwork URL meets the lower quality threshold.
 * Rejects empty strings, legacy desktop .ico files, and known microscopic dimensions (<= 32px).
 */
export function isQualityArtwork(rawUrl?: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  const trimmed = rawUrl.trim();
  if (
    !trimmed.startsWith("http://") &&
    !trimmed.startsWith("https://") &&
    !trimmed.startsWith("data:") &&
    !trimmed.startsWith("file://")
  ) {
    return false;
  }

  const lower = trimmed.toLowerCase();

  // Reject microscopic browser .ico files and generic favicons
  if (
    lower.endsWith(".ico") ||
    lower.includes("/favicon") ||
    lower.includes("favicon.") ||
    lower.includes("favicon-")
  ) {
    return false;
  }

  // Reject mobile bookmark touch-icons and low-res device icons
  if (
    lower.includes("apple-touch-icon") ||
    lower.includes("touch-icon") ||
    /(?:^|[\/_-])(?:ipad|iphone|android)(?:[\/._-]|$)/i.test(lower)
  ) {
    return false;
  }

  // Reject microscopic/tiny thumbnail indicators in URL path or parameters (<= 144px)
  if (
    /(?:^|[^a-z0-9])(?:16x16|32x32|48x48|64x64|72x72|80x80|96x96|120x120|128x128|144x144|16px|32px|48px|64px|72px|80px|96px|128px)(?:[^a-z0-9]|$)/i.test(
      lower,
    )
  ) {
    return false;
  }
  if (/[?&](?:w|h|width|height|size)=(?:1[0-4][0-9]|[1-9][0-9]?)(?:&|$)/i.test(lower)) {
    return false;
  }

  // Reject bare web pages that don't have an image path or extension
  if (!lower.startsWith("data:") && !lower.startsWith("file://")) {
    try {
      const parsed = new URL(trimmed);
      const path = parsed.pathname.toLowerCase();
      const hasImageExt = /\.(jpg|jpeg|png|webp|svg|gif|avif)($|\?)/i.test(path);
      const hasImagePath =
        /(?:^|\/)(?:image|images|img|cover|covers|artwork|art|media|assets|uploads|photos|pictures|logos)(?:\/|$)/i.test(
          path,
        );
      if (!hasImageExt && !hasImagePath) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Resolves an image source only when it meets the artwork quality standards.
 */
export function resolveQualityArtworkSource(rawUrl?: string): { uri: string } | undefined {
  if (!isQualityArtwork(rawUrl)) return undefined;
  return { uri: resolveArtworkUrl(rawUrl) };
}

export function resolveArtworkUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("file://") ||
    trimmed.startsWith("data:")
  ) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return `${API_ROOT}${trimmed}`;
  }
  return `${API_ROOT}/${trimmed}`;
}

// The player's TrackType values are these same strings; a type-only import keeps the native
// player module out of this file
export function audioTrackType(url: string): TrackType {
  if (url.endsWith(".m3u8")) return "hls" as TrackType;
  if (url.endsWith(".mpd")) return "dash" as TrackType;
  return "default" as TrackType;
}

export interface TrackEntitlementContext {
  user?: LoggedInUser | null;
  trackGroup?: AlbumProps;
  playCount?: number;
  disabledTrackIds?: Set<number>;
}

/**
 * Evaluates whether a track can be played based on user ownership, release date,
 * and preview play thresholds.
 */
export function isTrackPlayable(
  track: RNTrack,
  context?: TrackEntitlementContext,
): boolean {
  const user = context?.user;
  const trackGroup = context?.trackGroup ?? track.trackGroup;

  // 0. A song saved on this phone always plays from its file
  if (findDownload({ ...track, trackGroup })) return true;

  // 1. Preview tracks are playable unless explicitly disabled or play cap reached
  if (track.isPreview) {
    const effectivePlayCount =
      context?.playCount ??
      (typeof track.id === "number" ? getTrackPlaysSync(track.id) : undefined);
    const isExhausted = Boolean(
      (track.id &&
        (context?.disabledTrackIds?.has(track.id) || isTrackDisabledSync(track.id))) ||
        (typeof trackGroup?.artist?.maxFreePlays === "number" &&
          typeof effectivePlayCount === "number" &&
          effectivePlayCount >= trackGroup.artist.maxFreePlays),
    );

    if (!isExhausted) {
      return true;
    }
  }

  // 2. Unreleased releases cannot be streamed
  if (trackGroup?.releaseDate && new Date(trackGroup.releaseDate) > new Date()) {
    return false;
  }

  // 3. User must be logged in to own a non-preview or exhausted track
  if (!user) {
    return false;
  }

  // 4. Owned tracks (bought individually, album purchased, or user is artist) remain playable
  return isTrackOwned(track, trackGroup, user);
}

export const isTrackOwnedOrPreview = (
  track: RNTrack,
  user?: LoggedInUser | null,
  trackGroup?: AlbumProps,
  disabledTrackIds?: Set<number>,
): boolean => isTrackPlayable(track, { user, trackGroup, disabledTrackIds });

export const isTrackOwned = (
  track: RNTrack,
  trackGroup?: AlbumProps,
  user?: LoggedInUser | null,
) => {
  if (!user || !track) {
    return false;
  }
  const lookInTrackGroup = trackGroup ?? track.trackGroup;

  // Checks if you are the owner/artist of the track
  const ownsTrack = Boolean(lookInTrackGroup && lookInTrackGroup.artistId === user.id);
  // Checks if you bought the track individually
  const boughtTrack = Boolean(
    user.userTrackPurchases?.some((utp) => utp.trackId === track.id),
  );
  // Checks if you bought the album that the track belongs to
  const albumId =
    lookInTrackGroup?.id ??
    (lookInTrackGroup as any)?.trackGroupId ??
    track.trackGroupId;
  const boughtTrackGroup = Boolean(
    lookInTrackGroup?.userTrackGroupPurchases?.some((utgp) => utgp.userId === user.id) ||
      (albumId && user.userTrackGroupPurchases?.some((utgp) => utgp.trackGroupId === albumId)),
  );
  return ownsTrack || boughtTrack || boughtTrackGroup;
};

/**
 * Converts rich HTML formatting (e.g. from Faircamp/Chorus feeds) to clean Markdown.
 */
export function htmlToMarkdown(html?: string): string {
  if (!html || typeof html !== "string") return "";
  if (!html.includes("<") && !html.includes("&")) return html;

  return html
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, "**$2**")
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, "*$2*")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
    .replace(/&rsquo;|&lsquo;|&#8217;|&#8216;|&apos;|&#39;/g, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&hellip;|&#8230;/g, "...")
    .replace(/&mdash;|&#8212;/g, "—")
    .replace(/&ndash;|&#8211;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const linkifyUrls = (text: string) => {
  // Simple regex to find URLs that aren't already in markdown format
  const urlRegex = /(?<!\]\()https?:\/\/[^\s\)]+(?!\))/g;

  return text.replace(urlRegex, (url) => {
    // Convert plain URLs to markdown format
    return `[${url}](${url})`;
  });
};

// The song's page on mirlo.space. Social apps and messages show it with the cover art
export function songPageUrl(track: RNTrack): string | undefined {
  const artistSlug = track.trackGroup?.artist?.urlSlug;
  const albumSlug = track.trackGroup?.urlSlug;
  if (
    !artistSlug ||
    artistSlug === "fairplayer" ||
    !albumSlug ||
    albumSlug.startsWith("fairplayer-") ||
    !track.id
  ) {
    return undefined;
  }
  return `https://mirlo.space/${artistSlug}/release/${albumSlug}/tracks/${track.id}`;
}

// True when you bought this album (including adding it free), or it's your own
export const ownsAlbum = (user: LoggedInUser | null | undefined, album: AlbumProps): boolean =>
  !!user &&
  (album.artistId === user.id ||
    !!album.userTrackGroupPurchases?.some((p) => p.userId === user.id) ||
    !!user.userTrackGroupPurchases?.some((p) => p.trackGroupId === album.id));

