import { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  ViewProps,
  Text,
  Platform,
  Pressable,
} from "react-native";
import { useProgress } from "react-native-track-player";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePlayer } from "@/state/PlayerContext";
import { closeNowPlaying, openNowPlaying, useNowPlayingOpen } from "@/components/NowPlaying";
import { router, usePathname } from "expo-router";
import { theme } from "@/constants/theme";
import { RADIO_SET_SECONDS } from "@/scripts/radioTimer";
import { LibraryTab, setLibraryTab } from "@/state/libraryTab";
import {
  isQualityArtwork,
  resolveArtworkUrl,
} from "@/scripts/utils";

export type MainTab = "home" | "queue" | "library";

let currentTab: MainTab = "home";
const tabListeners = new Set<() => void>();

export function setMainTab(tab: MainTab) {
  if (currentTab === tab) return;
  currentTab = tab;
  tabListeners.forEach((listener) => listener());
}

export function openMainTab(tab: MainTab) {
  setMainTab(tab);
  closeNowPlaying();
  if (router.canDismiss()) {
    router.dismissAll();
  }
}

// Opens Library on the given tab
export function openLibraryTab(tab: LibraryTab) {
  setLibraryTab(tab);
  openMainTab("library");
}

export function useMainTab() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    tabListeners.add(listener);
    return () => {
      tabListeners.delete(listener);
    };
  }, []);
  return { tab: currentTab };
}

function NavTab({
  tab,
  label,
  children,
}: {
  tab: MainTab;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      android_ripple={{ color: theme.colors.ripple, borderless: true, radius: 36 }}
      onPress={() => openMainTab(tab)}
      style={({ pressed }) => [styles.navTab, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {children}
    </Pressable>
  );
}

function MiniPlayerProgressBar({ isLiveSet }: { isLiveSet: boolean }) {
  const progress = useProgress(1000);
  const duration = isLiveSet ? RADIO_SET_SECONDS : progress.duration;
  const progressPercent =
    duration > 0
      ? Math.min(100, Math.max(0, (progress.position / duration) * 100))
      : 0;

  return (
    <View style={styles.progressBarBg}>
      <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
    </View>
  );
}

export default function Footer({ style }: ViewProps) {
  const { bottom } = useSafeAreaInsets();
  const { activeTrack, isPlaying, togglePlayPause, skipNext, looping } = usePlayer("activeTrack", "isPlaying", "togglePlayPause", "skipNext", "looping");
  const { tab } = useMainTab();
  const pathname = usePathname();
  const isNowPlayingOpen = useNowPlayingOpen();

  const isTrackScreen =
    isNowPlayingOpen ||
    pathname.includes("/tracks/") ||
    pathname.endsWith("/tracks");
  const isLiveSet = Boolean(activeTrack?.liveStation && looping !== "track");

  const activeTab: MainTab | null =
    pathname === "/"
      ? tab
      : pathname === "/feed"
        ? "queue"
        : pathname === "/library"
          ? "library"
          : null;

  return (
    <View style={[styles.container, style]}>
      {/* Glossy Docked Mini-Player when a track is active and not on dedicated track / player screen */}
      {activeTrack && !isTrackScreen && (
        <View style={[styles.miniPlayer, { bottom: 60 + Math.max(bottom, 8) }]}>
          <MiniPlayerProgressBar isLiveSet={isLiveSet} />

          <Pressable
            android_ripple={{ color: theme.colors.ripple }}
            onPress={openNowPlaying}
            style={({ pressed }) => [styles.miniPlayerContent, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Open now playing"
          >
            <Image
              source={
                isQualityArtwork(activeTrack.artwork)
                  ? { uri: resolveArtworkUrl(activeTrack.artwork) }
                  : undefined
              }
              style={styles.miniArtwork}
            />

            <View style={styles.miniTrackInfo}>
              <Text style={styles.miniTitle} numberOfLines={1}>
                {activeTrack.title}
              </Text>
              <Text style={styles.miniArtist} numberOfLines={1}>
                {activeTrack.artist}
              </Text>
            </View>
          </Pressable>

          <View style={styles.miniControls}>
            <TouchableOpacity
              onPress={togglePlayPause}
              style={styles.miniPlayBtn}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? "Pause" : "Play"}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={22}
                color={theme.colors.playButtonIcon}
                style={!isPlaying && { transform: [{ translateX: 2 }] }}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={skipNext}
              style={styles.miniSkipBtn}
              accessibilityRole="button"
              accessibilityLabel="Skip Next"
            >
              <Ionicons name="play-skip-forward" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Consolidated 3-Tab Bottom Navigation Bar */}
      <View
        style={[
          styles.navBar,
          {
            paddingBottom: Math.max(bottom, 8),
            height: 60 + Math.max(bottom, 8),
          },
        ]}
      >
        <NavTab tab="home" label="Home">
          <Ionicons
            name={activeTab === "home" ? "home" : "home-outline"}
            size={24}
            color={activeTab === "home" ? theme.colors.primary : theme.colors.textSecondary}
          />
          <Text style={[styles.navLabel, activeTab === "home" && styles.navLabelActive]}>Home</Text>
        </NavTab>

        <NavTab tab="queue" label="Queue">
          <StackedBoxesIcon
            color={activeTab === "queue" ? theme.colors.primary : theme.colors.textSecondary}
          />
          <Text style={[styles.navLabel, activeTab === "queue" && styles.navLabelActive]}>Queue</Text>
        </NavTab>

        <NavTab tab="library" label="Library">
          <SimpleLibraryIcon
            color={activeTab === "library" ? theme.colors.primary : theme.colors.textSecondary}
          />
          <Text style={[styles.navLabel, activeTab === "library" && styles.navLabelActive]}>
            Library
          </Text>
        </NavTab>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  miniPlayer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  progressBarBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: theme.colors.progressTrack,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: theme.colors.primary,
    ...(Platform.OS === "web" ? ({ transition: "width 0.25s linear" } as any) : {}),
  },
  miniPlayerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  miniArtwork: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
  },
  artworkPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  miniTrackInfo: {
    marginLeft: 10,
    flex: 1,
  },
  miniTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "600",
    fontSize: 14,
  },
  miniArtist: {
    color: theme.colors.textCyan,
    fontSize: 12,
    marginTop: 2,
  },
  miniControls: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
    gap: 8,
  },
  miniPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  miniSkipBtn: {
    padding: 6,
  },
  navBar: {
    width: "100%",
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surfaceCardBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 8,
  },
  navTab: {
    flex: 1,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 4,
    fontWeight: "500",
  },
  navLabelActive: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
});

function SimpleLibraryIcon({ color }: { color: string }) {
  return (
    <View style={iconStyles.container}>
      <View style={[iconStyles.bar, { backgroundColor: color, height: 16 }]} />
      <View style={[iconStyles.bar, { backgroundColor: color, height: 20 }]} />
      <View style={[iconStyles.bar, { backgroundColor: color, height: 13, transform: [{ rotate: "18deg" }] }]} />
    </View>
  );
}

function StackedBoxesIcon({ color }: { color: string }) {
  return (
    <View style={stackedBoxStyles.container}>
      {/* Back box (offset upper-right) */}
      <View style={[stackedBoxStyles.backBox, { borderColor: color }]} />
      {/* Front box (offset lower-left) */}
      <View style={[stackedBoxStyles.frontBox, { borderColor: color }]} />
    </View>
  );
}

const iconStyles = StyleSheet.create({
  container: {
    width: 24,
    height: 24,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 3.5,
  },
  bar: {
    width: 3.5,
    borderRadius: theme.radius.full,
  },
});

const stackedBoxStyles = StyleSheet.create({
  container: {
    width: 24,
    height: 24,
    position: "relative",
  },
  backBox: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: theme.radius.xs,
    borderWidth: 2,
    opacity: 0.55,
  },
  frontBox: {
    position: "absolute",
    bottom: 2,
    left: 2,
    width: 14,
    height: 14,
    borderRadius: theme.radius.xs,
    borderWidth: 2,
    backgroundColor: theme.colors.surface,
  },
});
