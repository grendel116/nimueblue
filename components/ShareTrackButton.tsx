import { Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";
import { songPageUrl } from "@/scripts/utils";
import { NIMUE_BLUE_LISTEN_HUB, shareMessage } from "@/scripts/share";
import { findStation } from "@/queries/radio";
import { findPodcastShow } from "@/queries/podcast";
import { fairplayerReleaseSlug } from "@/queries/fairplayer";
import { findOnlineSong } from "@/scripts/albumLookup";

/**
 * Resolves the primary web page URL for the track (Mirlo song page, station site, or podcast site).
 */
export function resolveTrackSourceUrl(track: RNTrack): string {
  if (track.podcastId) {
    const show = findPodcastShow(track.podcastId);
    if (show?.webUrl) return show.webUrl;
    if (show?.feedUrl) return show.feedUrl;
  }

  if (track.liveStation) {
    const station = findStation(track.liveStation);
    if (station?.playlistPage) return station.playlistPage;
    if (station?.streamUrl) return station.streamUrl;
  }

  if (track.sourceUrl && !track.sourceUrl.includes("mirlo.space")) {
    return track.sourceUrl;
  }

  if (
    track.trackGroup?.sourceUrl &&
    !track.trackGroup.sourceUrl.includes("mirlo.space")
  ) {
    return track.trackGroup.sourceUrl;
  }

  const faircampSiteUrl = fairplayerReleaseSlug.siteUrl(
    track.trackGroup?.urlSlug,
  );
  if (faircampSiteUrl) {
    return faircampSiteUrl;
  }

  const songUrl = songPageUrl(track);
  if (songUrl) return songUrl;

  const artistSlug = track.trackGroup?.artist?.urlSlug;
  const albumSlug = track.trackGroup?.urlSlug;
  if (artistSlug && artistSlug !== "fairplayer" && albumSlug) {
    return `https://mirlo.space/${artistSlug}/release/${albumSlug}`;
  }
  if (artistSlug && artistSlug !== "fairplayer") {
    return `https://mirlo.space/${artistSlug}`;
  }

  return "https://mirlo.space";
}

/**
 * Builds the ultra-short share URL for tracks, radio stations, and podcasts.
 */
export function buildShareUrl(
  track: RNTrack,
  overrideTitle?: string,
  overrideArtist?: string,
  overrideArtwork?: string,
): string {
  const hubUrl = new URL(NIMUE_BLUE_LISTEN_HUB);
  const origin = hubUrl.origin;

  if (track.liveStation) {
    return `${origin}/r/${track.liveStation}`;
  }

  if (track.podcastId) {
    return `${origin}/p/${track.podcastId}`;
  }

  const faircampReleaseId = fairplayerReleaseSlug.decode(
    track.trackGroup?.urlSlug || "",
  );
  if (faircampReleaseId) {
    const fairplayerTrackId =
      track.fairplayerTrackId ||
      (Number.isSafeInteger(track.id) && track.id > 0
        ? String(track.id)
        : "");
    if (fairplayerTrackId) {
      return `${origin}/t/f${encodeURIComponent(fairplayerTrackId)}`;
    }
  }

  const isExternalTrack = Boolean(
    track.source && track.source !== "Mirlo Space" && !track.sourceUrl?.includes("mirlo.space"),
  );

  if (track.id && !isExternalTrack) {
    return `${origin}/t/${track.id}`;
  }

  const basePath = track.id ? `${origin}/t/${track.id}` : `${origin}/`;
  const url = new URL(basePath);

  const title = (overrideTitle || track.title || "").trim();
  const rawArtist = (overrideArtist || track.artist || "").trim();
  if (title) url.searchParams.set("title", title);
  if (rawArtist) url.searchParams.set("artist", rawArtist);
  if (track.trackGroup?.title) url.searchParams.set("album", track.trackGroup.title);

  const artistSlug = track.trackGroup?.artist?.urlSlug;
  const albumSlug = track.trackGroup?.urlSlug;
  if (artistSlug && albumSlug) {
    url.searchParams.set("app", `/artist/${artistSlug}/album/${albumSlug}/album-tracks`);
  }

  const web = resolveTrackSourceUrl(track);
  if (web) url.searchParams.set("web", web);

  const artwork =
    (overrideArtwork && !overrideArtwork.startsWith("file://") ? overrideArtwork : "") ||
    (track.artwork && !track.artwork.startsWith("file://") ? track.artwork : "") ||
    track.trackGroup?.cover?.sizes?.[600] ||
    track.trackGroup?.cover?.sizes?.[300] ||
    track.trackGroup?.cover?.sizes?.[120] ||
    (typeof track.trackGroup?.cover === "string" ? track.trackGroup?.cover : "") ||
    "";
  if (artwork && !artwork.startsWith("file://")) {
    url.searchParams.set("art", artwork);
  }

  const audio = track.audio?.url || track.url;
  if (audio && audio.startsWith("http")) {
    url.searchParams.set("audio", audio);
  }

  return url.toString();
}

/**
 * Formats the share message cleanly putting the artist first:
 * Returns the track label for native sheet titles, and strictly the share URL for fullText.
 */
export function buildShareMessage(
  track: RNTrack,
  overrideTitle?: string,
  overrideArtist?: string,
  overrideArtwork?: string,
): { headline: string; fullText: string; shareUrl: string } {
  const title = (overrideTitle || track.title || "").trim();
  const rawArtist = (overrideArtist || track.artist || "").trim();

  // For live stations when no song is on air, track.artist is "Live from Location"
  const isGenericLiveLocation = Boolean(
    track.liveStation && !overrideTitle && rawArtist.toLowerCase().startsWith("live from"),
  );
  const artist = isGenericLiveLocation ? "" : rawArtist;

  const shareUrl = buildShareUrl(track, overrideTitle, overrideArtist, overrideArtwork);
  const label = artist ? `${artist} - ${title}` : title;

  return { headline: label, fullText: shareUrl, shareUrl };
}

// Shares the current track and source link through the phone's share sheet.
// Browsers without a share sheet copy the text instead. A song that exists only as a file on
// the phone shares the link of its Mirlo or Faircamp page, found when you tap; with no page
// to link to, it shares the song's name
export default function ShareTrackButton({
  track,
  size = 22,
  overrideTitle,
  overrideArtist,
  overrideArtwork,
}: {
  track: RNTrack;
  size?: number;
  overrideTitle?: string;
  overrideArtist?: string;
  overrideArtwork?: string;
}) {
  const title = overrideTitle || track.title;
  if (!title) return null;

  const { headline, shareUrl } = buildShareMessage(
    track,
    overrideTitle,
    overrideArtist,
    overrideArtwork,
  );

  const isPhoneFile = Boolean(track.downloadAlbum) && track.id < 0;

  const share = async () => {
    let message = shareUrl;
    if (isPhoneFile) {
      const onlineSong = await findOnlineSong(track).catch(() => undefined);
      message = onlineSong ? buildShareUrl(onlineSong) : headline;
    }
    await shareMessage(message, headline);
  };

  return (
    <Pressable
      onPress={share}
      style={styles.button}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Share ${title}`}
    >
      <Ionicons name="share-social-outline" size={size} color={theme.colors.textCyan} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 4,
  },
});
