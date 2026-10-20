import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  BackHandler,
  Platform,
  Text,
  View,
  Image,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { usePullToClose } from "@/scripts/pullToClose";
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { usePlayer } from "@/state/PlayerContext";
import { openDownloadedAlbum, openDownloadedArtist } from "@/scripts/albumLookup";
import Player from "@/components/Player";
import { useRouter, type Href } from "expo-router";
import TrackPlayer, { useProgress } from "react-native-track-player";
import Slider from "@react-native-community/slider";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import DismissModalBar from "@/components/DismissModalBar";
import { theme } from "@/constants/theme";
import { useQuery } from "@tanstack/react-query";
import { queryRadioPlays, findStation } from "@/queries/radio";
import { RADIO_SET_SECONDS } from "@/scripts/radioTimer";
import { findPodcastShow } from "@/queries/podcast";
import { fairplayerReleaseSlug } from "@/queries/fairplayer";
import ShareTrackButton from "@/components/ShareTrackButton";
import FavoriteTrackButton from "@/components/FavoriteTrackButton";
import { releaseSupportUrl } from "@/scripts/hostLinks";
import Ionicons from "@expo/vector-icons/Ionicons";
import { openInBrowser } from "@/scripts/openInBrowser";
import { getRadioTimerElapsed, setRadioTimerElapsed } from "@/scripts/radioTimer";
import { albumHref } from "@/scripts/routes";
import {
  formatTime,
  isQualityArtwork,
  resolveArtworkUrl,
} from "@/scripts/utils";

const SETTLE_MS = 220;
const FLICK_VELOCITY = 600;

let isSheetOpen = false;
const sheetListeners = new Set<(open: boolean) => void>();

export function openNowPlaying() {
  isSheetOpen = true;
  sheetListeners.forEach((listener) => listener(true));
  openStateListeners.forEach((listener) => listener(true));
}

export function closeNowPlaying() {
  isSheetOpen = false;
  sheetListeners.forEach((listener) => listener(false));
  openStateListeners.forEach((listener) => listener(false));
}

// Follows whether the sheet is open, for the footer's mini-player
const openStateListeners = new Set<(open: boolean) => void>();

export function useNowPlayingOpen() {
  const [open, setOpen] = useState(isSheetOpen);
  useEffect(() => {
    openStateListeners.add(setOpen);
    return () => {
      openStateListeners.delete(setOpen);
    };
  }, []);
  return open;
}

export default function NowPlaying() {
  const { height: windowHeight } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const [visible, setVisible] = useState(isSheetOpen);
  const translateY = useSharedValue(isSheetOpen ? 0 : windowHeight);
  const heightSv = useSharedValue(windowHeight);
  const scrollOffset = useSharedValue(0);
  const startedAtTop = useSharedValue(true);

  useEffect(() => {
    heightSv.value = windowHeight;
    if (!visible) {
      translateY.value = windowHeight;
    }
  }, [windowHeight, visible, heightSv, translateY]);

  const finishClose = useCallback(() => {
    isSheetOpen = false;
    setVisible(false);
    openStateListeners.forEach((listener) => listener(false));
  }, []);

  const close = useCallback(() => {
    translateY.value = withTiming(heightSv.value, { duration: SETTLE_MS }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [translateY, heightSv, finishClose]);

  useEffect(() => {
    const listener = (open: boolean) => {
      if (open) {
        setVisible(true);
        translateY.value = withTiming(0, { duration: SETTLE_MS });
      } else {
        close();
      }
    };
    sheetListeners.add(listener);
    return () => {
      sheetListeners.delete(listener);
    };
  }, [translateY, close]);

  // Android Back closes the sheet before it leaves the screen underneath
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [visible, close]);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollOffset.value = event.contentOffset.y;
  });

  // Slides the sheet away after a quick flick or a pull past a quarter of the screen,
  // otherwise back into place
  const settle = useCallback(
    (velocityY: number) => {
      "worklet";
      const shouldClose =
        velocityY > FLICK_VELOCITY ||
        (velocityY > -FLICK_VELOCITY && translateY.value > heightSv.value * 0.25);
      translateY.value = withTiming(
        shouldClose ? heightSv.value : 0,
        { duration: SETTLE_MS },
        (finished) => {
          if (finished && shouldClose) runOnJS(finishClose)();
        },
      );
    },
    [translateY, heightSv, finishClose],
  );

  const scrollGesture = useMemo(() => Gesture.Native(), []);

  // Drag down to close Now Playing when scrolled to the top
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(10)
        .failOffsetX([-16, 16])
        .simultaneousWithExternalGesture(scrollGesture)
        .onStart(() => {
          startedAtTop.value = scrollOffset.value <= 0;
        })
        .onUpdate((event) => {
          if (!startedAtTop.value) return;
          translateY.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          if (!startedAtTop.value) return;
          settle(event.velocityY);
        }),
    [scrollGesture, scrollOffset, startedAtTop, translateY, settle],
  );

  const sheetRef = useRef<View>(null);
  usePullToClose(sheetRef, visible, {
    onPull: (distance) => {
      translateY.value = distance;
    },
    onRelease: settle,
  });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: translateY.value >= heightSv.value ? 0 : 1,
  }));

  const isWeb = Platform.OS === "web";
  const scroll = (
    <Animated.ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
    >
      <NowPlayingBody visible={visible} close={close} />
    </Animated.ScrollView>
  );
  const content = (
    <View ref={sheetRef} style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.container}>
        <DismissModalBar onPress={close} />
        {isWeb ? scroll : <GestureDetector gesture={scrollGesture}>{scroll}</GestureDetector>}
      </SafeAreaView>
    </View>
  );

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[styles.sheet, { bottom: 60 + Math.max(bottom, 8) }, sheetStyle]}
    >
      {visible && (isWeb ? content : <GestureDetector gesture={panGesture}>{content}</GestureDetector>)}
    </Animated.View>
  );
}

function NowPlayingBody({ visible, close }: { visible: boolean; close: () => void }) {
  const { activeTrack, looping } = usePlayer("activeTrack", "looping");
  const router = useRouter();
  const { width } = useWindowDimensions();

  // Links lead to pages under the sheet, so the sheet slides away as the page opens
  const go = useCallback(
    (href: Href) => {
      close();
      router.navigate(href);
    },
    [close, router],
  );

  const albumArtSize = Math.min(width - 48, 380);

  // Live radio: show the song on air from the station's playlist feed (refreshes every minute)
  const station = findStation(activeTrack?.liveStation);
  const podcastShow = findPodcastShow(activeTrack?.podcastId);
  const isLive = Boolean(station);
  // Repeat one keeps a station on past its 10-minute set
  const hasSetTimer = isLive && looping !== "track";
  const { data: plays } = useQuery(queryRadioPlays(station));
  const onAir = plays?.[0];
  const [imgError, setImgError] = useState(false);
  const artworkUri = isLive
    ? (isQualityArtwork(onAir?.artwork) ? onAir?.artwork : station?.artwork)
    : (activeTrack?.artwork || activeTrack?.trackGroup?.cover?.sizes?.[600]);

  useEffect(() => {
    setImgError(false);
  }, [artworkUri]);

  const artworkSource = (!imgError && isQualityArtwork(artworkUri))
    ? { uri: resolveArtworkUrl(artworkUri) }
    : undefined;

  return (
    <>
      {/* Glossy Album Art Container */}
      <View style={[styles.artworkContainer, { width: albumArtSize, height: albumArtSize }]}>
        <Image
          source={artworkSource}
          style={styles.artworkImage}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      </View>

      {/* Track & Artist Info */}
      {isLive ? (
        <View style={styles.trackInfoSection}>
          <View style={styles.titleRow}>
            <ScrollView
              key={onAir?.song || activeTrack?.title}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.titleScroll}
              contentContainerStyle={styles.titleScrollContent}
            >
              <Text style={styles.trackTitle} numberOfLines={1}>
                {onAir?.song || activeTrack?.title}
              </Text>
            </ScrollView>
            <View style={styles.titleActions}>
              <View style={styles.actionIconGroup}>
                {activeTrack ? (
                  <FavoriteTrackButton track={activeTrack} size={22} style={{ padding: 4 }} />
                ) : null}
                {activeTrack ? (
                  <ShareTrackButton
                    track={activeTrack}
                    overrideTitle={onAir?.song}
                    overrideArtist={onAir?.artist}
                    overrideArtwork={onAir?.artwork}
                  />
                ) : null}
              </View>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
          </View>

          <View style={styles.artistGroupRow}>
            <Text style={styles.infoLabel}>by </Text>
            <Text style={styles.cyanLink} numberOfLines={1}>
              {onAir?.artist || activeTrack?.artist}
            </Text>
          </View>

          <View style={styles.artistGroupRow}>
            <Text style={styles.infoLabel}>On </Text>
            <Pressable
              onPress={() => {
                if (!station) return;
                go({ pathname: "/station/[id]", params: { id: station.id } });
              }}
              style={styles.linkPressable}
            >
              <Text style={styles.cyanLink} numberOfLines={1}>
                {activeTrack?.title}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.trackInfoSection}>
          <View style={styles.titleRow}>
            <ScrollView
              key={activeTrack?.id ?? activeTrack?.title}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.titleScroll}
              contentContainerStyle={styles.titleScrollContent}
            >
              <Text style={styles.trackTitle} numberOfLines={1}>
                {activeTrack?.title || "No track playing"}
              </Text>
            </ScrollView>
            <View style={styles.titleActions}>
              <View style={styles.actionIconGroup}>
                {activeTrack ? (
                  <FavoriteTrackButton track={activeTrack} size={22} style={{ padding: 4 }} />
                ) : null}
                {activeTrack ? <ShareTrackButton track={activeTrack} /> : null}
              </View>
            </View>
          </View>

          <View style={styles.artistGroupRow}>
            <Text style={styles.infoLabel}>
              {activeTrack?.podcastId ? "Show " : "from "}
            </Text>
            <Pressable
              onPress={() => {
                if (activeTrack?.podcastId) {
                  go({
                    pathname: "/podcast/[id]",
                    params: { id: activeTrack.podcastId },
                  });
                  return;
                }
                if (!activeTrack?.trackGroup) return;
                if (activeTrack.downloadAlbum) {
                  close();
                  openDownloadedAlbum(activeTrack.downloadAlbum);
                  return;
                }
                const href = albumHref({
                  ...activeTrack.trackGroup,
                  urlSlug:
                    activeTrack.trackGroup.urlSlug ||
                    activeTrack.trackGroup.id ||
                    activeTrack.trackGroupId,
                });
                if (href) go(href);
              }}
              style={styles.linkPressable}
            >
              <Text style={styles.cyanLink} numberOfLines={1}>
                {activeTrack?.trackGroup?.title}
              </Text>
            </Pressable>
          </View>

          <View style={styles.artistGroupRow}>
            <Text style={styles.infoLabel}>
              {activeTrack?.podcastId ? "Host " : "by "}
            </Text>
            {/* Podcasts have no artist page to open */}
            {activeTrack?.podcastId ? (
              <Text style={styles.infoLabel} numberOfLines={1}>
                {activeTrack.artist}
              </Text>
            ) : (
              <Pressable
                onPress={() => {
                  if (!activeTrack?.trackGroup) return;
                  if (activeTrack.downloadAlbum) {
                    close();
                    openDownloadedArtist(activeTrack.downloadAlbum);
                    return;
                  }
                  const artistPageId = fairplayerReleaseSlug.artistPageRouteId({
                    artistId:
                      activeTrack.trackGroup.artistId ?? activeTrack.trackGroup.artist?.id,
                    artist: {
                      name: activeTrack.trackGroup.artist?.name || activeTrack.artist,
                      urlSlug: activeTrack.trackGroup.artist?.urlSlug,
                    },
                    urlSlug: activeTrack.trackGroup.urlSlug,
                    source: activeTrack.source || activeTrack.trackGroup.source,
                  });
                  if (!artistPageId) return;
                  go({
                    pathname: "/artist/[id]/artist-page",
                    params: { id: artistPageId },
                  });
                }}
                style={styles.linkPressable}
              >
                <Text style={styles.cyanLink} numberOfLines={1}>
                  {activeTrack?.artist}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Progress Slider (on live radio, sliding adjusts the 10-minute set countdown without altering audio playback) */}
      {visible && (!isLive || hasSetTimer) && <ProgressSection isLive={isLive} />}

      {/* Playback Controls */}
      <View style={styles.playerWrapper}>
        <Player />
      </View>

      {/* Support actions: radio donation, podcast support, or Mirlo artist support */}
      {station ? (
        <Pressable
          onPress={() => openInBrowser(station.donatePage)}
          style={styles.donateButton}
          accessibilityRole="button"
          accessibilityLabel={`Donate to ${station.name}`}
        >
          <Ionicons name="cash-outline" size={16} color={theme.colors.playButtonIcon} />
          <Text style={styles.donateText}>Donate to {station.name}</Text>
        </Pressable>
      ) : podcastShow?.supportUrl ? (
        <Pressable
          onPress={() => openInBrowser(podcastShow.supportUrl!)}
          style={styles.donateButton}
          accessibilityRole="button"
          accessibilityLabel={`Support ${podcastShow.name}`}
        >
          <Ionicons name="cash-outline" size={16} color={theme.colors.playButtonIcon} />
          <Text style={styles.donateText} numberOfLines={1}>
            Support {podcastShow.name}
          </Text>
        </Pressable>
      ) : activeTrack ? (
        <SupportArtistButton track={activeTrack} />
      ) : null}
    </>
  );
}

function ProgressSection({ isLive }: { isLive: boolean }) {
  const { skipNext } = usePlayer("skipNext");
  const progress = useProgress(200);
  const [slidingValue, setSlidingValue] = useState<number | null>(null);
  const shown = slidingValue ?? (isLive ? getRadioTimerElapsed(progress.position) : progress.position);

  return (
    <View style={styles.progressContainer}>
      <Slider
        style={styles.progressBar}
        value={shown}
        minimumValue={0}
        maximumValue={isLive ? RADIO_SET_SECONDS : (progress.duration || 1)}
        thumbTintColor={theme.colors.primary}
        minimumTrackTintColor={theme.colors.primary}
        maximumTrackTintColor={theme.colors.progressTrack}
        onValueChange={(val) => setSlidingValue(val)}
        onSlidingComplete={async (val) => {
          setSlidingValue(null);
          if (isLive) {
            setRadioTimerElapsed(val, progress.position);
            if (val >= RADIO_SET_SECONDS) {
              await skipNext();
            }
          } else {
            await TrackPlayer.seekTo(val);
          }
        }}
      />
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(shown)}</Text>
        <Text style={styles.timeText}>
          {formatTime(isLive ? RADIO_SET_SECONDS : progress.duration)}
        </Text>
      </View>
    </View>
  );
}

// Opens the artist's support page on the host the song comes from
function SupportArtistButton({ track }: { track: RNTrack }) {
  const albumSlug = track.trackGroup?.urlSlug;
  const isFaircamp = Boolean(
    track.fairplayerTrackId || fairplayerReleaseSlug.decode(String(albumSlug || "")),
  );
  const url = releaseSupportUrl({
    ...track.trackGroup,
    source: track.source || track.trackGroup?.source || (isFaircamp ? "Faircamp" : undefined),
    sourceUrl: track.trackGroup?.sourceUrl || track.sourceUrl || fairplayerReleaseSlug.siteUrl(albumSlug),
  });
  const artistName = track.trackGroup?.artist?.name ?? track.artist;

  if (!url) return null;

  return (
    <Pressable
      onPress={() => openInBrowser(url)}
      style={styles.donateButton}
      accessibilityRole="button"
      accessibilityLabel={`Support ${artistName}`}
    >
      <Ionicons name="cash-outline" size={16} color={theme.colors.playButtonIcon} />
      <Text style={styles.donateText} numberOfLines={1}>
        Support {artistName}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  sheet: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.background,
  },
  donateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 28,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
  },
  donateText: {
    color: theme.colors.playButtonIcon,
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  artworkContainer: {
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 28,
  },
  artworkImage: {
    width: "100%",
    height: "100%",
  },
  artworkPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
  },
  placeholderText: {
    color: theme.colors.textMuted,
    fontSize: 20,
    fontWeight: "700",
  },
  trackInfoSection: {
    width: "100%",
    marginBottom: 20,
    gap: 6,
  },
  trackTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    letterSpacing: -0.3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  titleScroll: {
    flex: 1,
  },
  titleScrollContent: {
    alignItems: "center",
  },
  artistGroupRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  infoLabel: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  linkPressable: {
    flexShrink: 1,
  },
  cyanLink: {
    color: theme.colors.textCyan,
    fontSize: 14,
    fontWeight: "600",
  },
  progressContainer: {
    width: "100%",
    marginBottom: 20,
  },
  progressBar: {
    width: "100%",
    height: 40,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 4,
  },
  timeText: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  titleActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionIconGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.danger,
  },
  liveText: {
    fontFamily: theme.fonts.sans,
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  playerWrapper: {
    width: "100%",
    marginTop: 10,
    marginBottom: 30,
  },
});
