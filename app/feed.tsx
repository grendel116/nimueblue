import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  PanResponder,
  Platform,
  Animated,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePlayer, QueueSlot } from "@/state/PlayerContext";
import { openMainTab } from "@/components/Footer";
import { theme } from "@/constants/theme";
import { AUTOPLAY_SOURCE } from "@/scripts/autoplay";
import { fairplayerReleaseSlug } from "@/queries/fairplayer";
import ShuffleButton from "@/components/ShuffleButton";
import LoopButton from "@/components/LoopButton";
import {
  QueueMetrics,
  QueueDragState,
  computeQueueDrag,
  getRowOffset,
  getVisibleIndices,
  slotBaseY,
  nextUpHeaderY,
  autoplayDividerY,
  totalDragAreaHeight,
  ROW_HEIGHT,
  NEXT_UP_HEIGHT,
  AUTOPLAY_HEIGHT,
} from "@/scripts/queueDrag";

const OVERSCAN_PX = ROW_HEIGHT * 12;
const SCROLL_STEP_PX = ROW_HEIGHT * 3;
const INITIAL_VIEWPORT_HEIGHT = Dimensions.get("window").height || 900;

type QueueRowProps = {
  track: RNTrack;
  section: QueueSlot["section"];
  index: number;
  baseY: number;
  targetY: number;
  dragging: boolean;
  isAnyDragging: boolean;
  onPlay: (section: QueueSlot["section"], index: number) => void;
  onDragStart: (slot: QueueSlot) => void;
  onDragMove: (dy: number) => void;
  onDragEnd: () => void;
};

const QueueRow = React.memo(function QueueRow({
  track,
  section,
  index,
  baseY,
  targetY,
  dragging,
  isAnyDragging,
  onPlay,
  onDragStart,
  onDragMove,
  onDragEnd,
}: QueueRowProps) {
  const slotRef = useRef<QueueSlot>({ section, index });
  slotRef.current = { section, index };

  const baseYRef = useRef(baseY);
  baseYRef.current = baseY;
  const dragStartYRef = useRef(baseY);
  const prevTargetYRef = useRef(targetY);
  const wasDraggingRef = useRef(false);

  const yAnim = useRef(new Animated.Value(targetY)).current;

  useEffect(() => {
    if (dragging) {
      wasDraggingRef.current = true;
      prevTargetYRef.current = targetY;
      return;
    }
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      prevTargetYRef.current = targetY;
      Animated.spring(yAnim, {
        toValue: targetY,
        useNativeDriver: true,
        damping: 26,
        stiffness: 380,
        mass: 0.5,
      }).start();
      return;
    }
    if (prevTargetYRef.current !== targetY) {
      prevTargetYRef.current = targetY;
      Animated.spring(yAnim, {
        toValue: targetY,
        useNativeDriver: true,
        damping: 22,
        stiffness: 280,
        mass: 0.6,
      }).start();
    }
  }, [targetY, dragging, yAnim]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragStartYRef.current = baseYRef.current;
        yAnim.stopAnimation();
        yAnim.setValue(baseYRef.current);
        onDragStart(slotRef.current);
      },
      onPanResponderMove: (_e, g) => {
        yAnim.setValue(dragStartYRef.current + g.dy);
        onDragMove(g.dy);
      },
      onPanResponderRelease: () => onDragEnd(),
      onPanResponderTerminate: () => onDragEnd(),
    }),
  ).current;

  const artwork =
    track.artwork ||
    track.trackGroup?.cover?.sizes?.[300] ||
    track.trackGroup?.cover?.sizes?.[120];
  const isExplicit = (track as any).isExplicit || (track as any).explicit;

  return (
    <Animated.View
      style={[
        styles.trackRow,
        dragging && styles.trackRowDragging,
        {
          transform: [
            { translateY: yAnim },
            { scale: dragging ? 1.02 : 1 },
          ],
        },
      ]}
    >
      <Pressable
        onPress={() => onPlay(section, index)}
        disabled={isAnyDragging}
        style={styles.trackMainPressable}
      >
        <View style={styles.trackThumbWrapper}>
          {artwork ? (
            <Image source={{ uri: artwork }} style={styles.trackThumb} />
          ) : (
            <View style={[styles.trackThumb, styles.thumbPlaceholder]}>
              <Ionicons name="musical-notes" size={16} color={theme.colors.primary} />
            </View>
          )}
        </View>

        <View style={styles.trackInfo}>
          <Text
            style={[styles.trackTitle, dragging && styles.trackTitleDragging]}
            numberOfLines={1}
          >
            {track.title}
          </Text>
          <View style={styles.artistRow}>
            {isExplicit && (
              <View style={styles.explicitBadge}>
                <Text style={styles.explicitText}>E</Text>
              </View>
            )}
            <Text style={styles.trackArtist} numberOfLines={1}>
              {track.artist || track.trackGroup?.artist?.name || ""}
            </Text>
          </View>
        </View>
      </Pressable>

      <View
        {...responder.panHandlers}
        style={styles.reorderHandle}
        accessibilityLabel={`Drag to reorder ${track.title}`}
      >
        <Ionicons
          name="reorder-three"
          size={24}
          color={dragging ? theme.colors.primary : theme.colors.textSecondary}
        />
      </View>
    </Animated.View>
  );
});

export default function QueueScreen() {
  const router = useRouter();
  const {
    activeTrack,
    queueSource,
    userQueue,
    upcoming: upcomingTracks,
    clearUserQueue,
    removeFromUserQueue,
    moveQueueItem,
    playFromUserQueue,
    skipToUpcoming,
  } = usePlayer("activeTrack", "queueSource", "userQueue", "upcoming", "clearUserQueue", "removeFromUserQueue", "moveQueueItem", "playFromUserQueue", "skipToUpcoming");

  const [activeMenu, setActiveMenu] = useState<{
    visible: boolean;
    track?: RNTrack;
    isQueueHeader?: boolean;
    queueIndex?: number;
  }>({ visible: false });

  // Once playback has moved into autoplay, every upcoming track is a discovery pick
  const nextUpSource = activeTrack?.autoplay ? AUTOPLAY_SOURCE : queueSource;
  const firstAutoplayIndex = activeTrack?.autoplay
    ? -1
    : upcomingTracks.findIndex((t) => t.autoplay);

  const currentArtwork =
    activeTrack?.artwork ||
    activeTrack?.trackGroup?.cover?.sizes?.[300] ||
    activeTrack?.trackGroup?.cover?.sizes?.[600];

  const metrics: QueueMetrics = useMemo(
    () => ({
      queueCount: userQueue.length,
      upcomingCount: upcomingTracks.length,
      firstAutoplayIndex,
    }),
    [userQueue.length, upcomingTracks.length, firstAutoplayIndex],
  );
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;

  // ---- Viewport Virtualization ----
  const [windowScrollY, setWindowScrollY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(INITIAL_VIEWPORT_HEIGHT);
  const lastWindowScrollY = useRef(0);
  const dragAreaTopRef = useRef(150);

  // ---- Drag and drop ----
  const moveRef = useRef(moveQueueItem);
  moveRef.current = moveQueueItem;
  const dragRef = useRef<QueueDragState | null>(null);
  const [drag, setDrag] = useState<QueueDragState | null>(null);

  const isAnyDragging = Boolean(drag);
  const nextUpTargetY = nextUpHeaderY(metrics) + (drag?.nextUpHeaderOffset ?? 0);
  const autoplayTargetY = autoplayDividerY(metrics) + (drag?.autoplayDividerOffset ?? 0);

  const nextUpHeaderAnim = useRef(new Animated.Value(nextUpTargetY)).current;
  const prevNextUpYRef = useRef(nextUpTargetY);
  const autoplayDividerAnim = useRef(new Animated.Value(autoplayTargetY)).current;
  const prevAutoplayYRef = useRef(autoplayTargetY);

  useEffect(() => {
    if (prevNextUpYRef.current !== nextUpTargetY) {
      prevNextUpYRef.current = nextUpTargetY;
      Animated.spring(nextUpHeaderAnim, {
        toValue: nextUpTargetY,
        useNativeDriver: true,
        damping: 22,
        stiffness: 280,
        mass: 0.6,
      }).start();
    }
  }, [nextUpTargetY, nextUpHeaderAnim]);

  useEffect(() => {
    if (prevAutoplayYRef.current !== autoplayTargetY) {
      prevAutoplayYRef.current = autoplayTargetY;
      Animated.spring(autoplayDividerAnim, {
        toValue: autoplayTargetY,
        useNativeDriver: true,
        damping: 22,
        stiffness: 280,
        mass: 0.6,
      }).start();
    }
  }, [autoplayTargetY, autoplayDividerAnim]);

  const onPlayRow = useCallback(
    (section: QueueSlot["section"], index: number) => {
      if (section === "queue") playFromUserQueue(index);
      else skipToUpcoming(index);
    },
    [playFromUserQueue, skipToUpcoming],
  );

  const onDragStart = useCallback((slot: QueueSlot) => {
    const next = computeQueueDrag(slot, 0, metricsRef.current);
    dragRef.current = next;
    setDrag(next);
  }, []);

  const onDragMove = useCallback((dy: number) => {
    const current = dragRef.current;
    if (!current) return;
    const next = computeQueueDrag(current.from, dy, metricsRef.current);
    if (
      next.target.section !== current.target.section ||
      next.target.index !== current.target.index
    ) {
      dragRef.current = next;
      setDrag(next);
    }
  }, []);

  const onDragEnd = useCallback(() => {
    const current = dragRef.current;
    dragRef.current = null;
    if (current) moveRef.current(current.from, current.target);
    setDrag(null);
  }, []);

  const minY = Math.max(0, windowScrollY - dragAreaTopRef.current - OVERSCAN_PX);
  const maxY = windowScrollY - dragAreaTopRef.current + viewportHeight + OVERSCAN_PX;

  const visibleRows = useMemo(() => {
    const qIndices = getVisibleIndices("queue", metrics, minY, maxY, drag?.from);
    const uIndices = getVisibleIndices("upcoming", metrics, minY, maxY, drag?.from);
    const seenKeys = new Map<string, number>();
    const rows: {
      key: string;
      track: RNTrack;
      section: QueueSlot["section"];
      index: number;
    }[] = [];

    const pushRow = (track: RNTrack | undefined, section: QueueSlot["section"], index: number) => {
      if (!track) return;
      const baseKey = track._queueKey || `track-${track.id ?? track.url ?? track.title}`;
      const count = (seenKeys.get(baseKey) ?? 0) + 1;
      seenKeys.set(baseKey, count);
      rows.push({
        key: count === 1 ? baseKey : `${baseKey}-${count}`,
        track,
        section,
        index,
      });
    };

    for (const idx of qIndices) pushRow(userQueue[idx], "queue", idx);
    for (const idx of uIndices) pushRow(upcomingTracks[idx], "upcoming", idx);

    return rows;
  }, [metrics, minY, maxY, drag?.from, userQueue, upcomingTracks]);

  const draggedTrack = drag
    ? drag.from.section === "queue"
      ? userQueue[drag.from.index]
      : upcomingTracks[drag.from.index]
    : undefined;

  const draggedArtwork =
    draggedTrack?.artwork ||
    draggedTrack?.trackGroup?.cover?.sizes?.[300] ||
    draggedTrack?.trackGroup?.cover?.sizes?.[120];

  const areaHeight = totalDragAreaHeight(metrics);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Top Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : openMainTab("home"))}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!drag}
        scrollEventThrottle={16}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0) setViewportHeight(h);
        }}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          if (Math.abs(y - lastWindowScrollY.current) >= SCROLL_STEP_PX) {
            lastWindowScrollY.current = y;
            setWindowScrollY(y);
          }
        }}
      >
        {/* Currently Playing Card */}
        {activeTrack ? (
          <View style={styles.nowPlayingCard}>
            <View style={styles.cardThumbWrapper}>
              {currentArtwork ? (
                <Image source={{ uri: currentArtwork }} style={styles.cardThumb} />
              ) : (
                <View style={[styles.cardThumb, styles.thumbPlaceholder]}>
                  <Ionicons name="musical-notes" size={20} color={theme.colors.primary} />
                </View>
              )}
            </View>

            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {activeTrack.title}
              </Text>
              <Text style={styles.cardArtist} numberOfLines={1}>
                {activeTrack.artist || activeTrack.trackGroup?.artist?.name || "Mirlo"}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() =>
                setActiveMenu({
                  visible: true,
                  track: activeTrack,
                })
              }
              style={styles.optionsButton}
              accessibilityRole="button"
              accessibilityLabel="Track Options"
            >
              <Ionicons name="ellipsis-vertical" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.nowPlayingCard}>
            <View style={[styles.cardThumb, styles.thumbPlaceholder]}>
              <Ionicons name="musical-notes" size={20} color={theme.colors.textMuted} />
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle}>Nothing Playing</Text>
              <Text style={styles.cardArtist}>Play a track to start listening</Text>
            </View>
          </View>
        )}

        {/* Section: Your Queue Header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Your Queue</Text>
          {userQueue.length > 0 && (
            <TouchableOpacity
              onPress={() =>
                setActiveMenu({
                  visible: true,
                  isQueueHeader: true,
                })
              }
              style={styles.optionsButton}
              accessibilityRole="button"
              accessibilityLabel="Queue Options"
            >
              <Ionicons name="ellipsis-vertical" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Virtualized, O(1) Coordinate-Synchronized Drag Area */}
        <View
          style={[styles.dragArea, { height: areaHeight }]}
          onLayout={(e) => {
            dragAreaTopRef.current = e.nativeEvent.layout.y;
          }}
        >
          {userQueue.length === 0 && (
            <View
              style={[
                styles.emptyQueuePrompt,
                drag?.target.section === "queue" && styles.emptyQueueHidden,
              ]}
            >
              <Text style={styles.emptyQueueText}>No manually queued songs</Text>
            </View>
          )}

          {/* Placeholder shown in Your Queue when its sole item is dragged down into Next Up */}
          {drag?.showEmptyQueueUnderneath && (
            <View pointerEvents="none" style={styles.emptyQueuePrompt}>
              <Text style={styles.emptyQueueText}>No manually queued songs</Text>
            </View>
          )}

          {/* Section: Next Up from the loaded playlist */}
          {upcomingTracks.length > 0 && (
            <Animated.View
              style={[
                styles.sectionHeaderRow,
                styles.nextUpHeader,
                { transform: [{ translateY: nextUpHeaderAnim }] },
              ]}
            >
              <Text style={[styles.autoplayDividerText, styles.nextUpTitle]} numberOfLines={1}>
                {nextUpSource ? `Next Up from: ${nextUpSource}` : "Next Up"}
              </Text>
              <View style={styles.modeButtons}>
                <ShuffleButton />
                <LoopButton />
              </View>
            </Animated.View>
          )}

          {/* Autoplay Discovery Divider */}
          {firstAutoplayIndex >= 0 && upcomingTracks.length > 0 && (
            <Animated.View
              style={[
                styles.autoplayDivider,
                { transform: [{ translateY: autoplayDividerAnim }] },
              ]}
            >
              <Ionicons name="radio-outline" size={14} color={theme.colors.primary} />
              <Text style={styles.autoplayDividerText}>
                Then: {AUTOPLAY_SOURCE}
              </Text>
            </Animated.View>
          )}

          {/* Unified visible rows list so track instances never unmount across section moves */}
          {visibleRows.map(({ key, track, section, index }) => {
            const slot: QueueSlot = { section, index };
            const baseY = slotBaseY(metrics, slot);
            const targetY = baseY + getRowOffset(slot, drag, metrics);
            const dragging =
              drag?.from.section === section && drag.from.index === index;
            return (
              <QueueRow
                key={key}
                track={track}
                section={section}
                index={index}
                baseY={baseY}
                targetY={targetY}
                dragging={dragging}
                isAnyDragging={isAnyDragging}
                onPlay={onPlayRow}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
              />
            );
          })}

          {/* Open Drop Slot Preview showing where the dragged track will land */}
          {drag && draggedTrack && (
            <View
              pointerEvents="none"
              style={[
                styles.dropSlot,
                { top: drag.slotY, height: ROW_HEIGHT },
              ]}
            >
              <View style={[styles.trackThumbWrapper, styles.dropSlotThumb]}>
                {draggedArtwork ? (
                  <Image source={{ uri: draggedArtwork }} style={styles.trackThumb} />
                ) : (
                  <View style={[styles.trackThumb, styles.thumbPlaceholder]}>
                    <Ionicons name="musical-notes" size={16} color={theme.colors.primary} />
                  </View>
                )}
              </View>
              <View style={styles.trackInfo}>
                <Text style={styles.dropSlotTitle} numberOfLines={1}>
                  {draggedTrack.title}
                </Text>
                <Text style={styles.dropSlotSubtitle} numberOfLines={1}>
                  {drag.target.section === "queue"
                    ? `Place #${drag.target.index + 1} in Your Queue`
                    : `Place #${drag.target.index + 1} in Next Up`}
                </Text>
              </View>
              <View style={styles.dropSlotIcon}>
                <Ionicons name="locate-outline" size={20} color={theme.colors.primary} />
              </View>
            </View>
          )}
        </View>

        {/* Global Empty State if nothing is playing and queue is completely empty */}
        {!activeTrack && userQueue.length === 0 && upcomingTracks.length === 0 && (
          <View style={styles.fullEmptyContainer}>
            <TouchableOpacity
              onPress={() => openMainTab("home")}
              style={styles.exploreButton}
              accessibilityRole="button"
              accessibilityLabel="Explore Music"
            >
              <Text style={styles.exploreButtonText}>Explore Music</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Options Modal */}
      <Modal
        visible={activeMenu.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveMenu({ visible: false })}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setActiveMenu({ visible: false })}
        >
          <View style={styles.modalSheet}>
            {activeMenu.isQueueHeader ? (
              <TouchableOpacity
                style={styles.modalItem}
                onPress={() => {
                  clearUserQueue();
                  setActiveMenu({ visible: false });
                }}
              >
                <Ionicons name="trash-outline" size={20} color="#ff5252" />
                <Text style={[styles.modalItemText, { color: "#ff5252" }]}>Clear Queue</Text>
              </TouchableOpacity>
            ) : activeMenu.track ? (
              <>
                {activeMenu.track.trackGroup && (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      const tg = activeMenu.track!.trackGroup;
                      setActiveMenu({ visible: false });
                      if (tg?.urlSlug && (tg?.artistId || fairplayerReleaseSlug.decode(String(tg.urlSlug)))) {
                        router.push({
                          pathname: "/artist/[id]/album/[slug]/album-tracks",
                          params: {
                            id:
                              fairplayerReleaseSlug.artistRouteId(String(tg.urlSlug)) ??
                              String(tg.artist?.urlSlug || tg.artistId),
                            slug: String(tg.urlSlug),
                          },
                        });
                      }
                    }}
                  >
                    <Ionicons name="disc-outline" size={20} color={theme.colors.textPrimary} />
                    <Text style={styles.modalItemText}>View Album</Text>
                  </TouchableOpacity>
                )}
                {activeMenu.queueIndex !== undefined && (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      removeFromUserQueue(activeMenu.queueIndex!);
                      setActiveMenu({ visible: false });
                    }}
                  >
                    <Ionicons name="remove-circle-outline" size={20} color="#ff5252" />
                    <Text style={[styles.modalItemText, { color: "#ff5252" }]}>Remove from Queue</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : null}

            <TouchableOpacity
              style={[styles.modalItem, styles.modalCloseItem]}
              onPress={() => setActiveMenu({ visible: false })}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  nowPlayingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceElevated,
    marginHorizontal: 16,
    borderRadius: theme.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    marginBottom: 20,
  },
  cardThumbWrapper: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.sm,
    overflow: "hidden",
  },
  cardThumb: {
    width: 52,
    height: 52,
  },
  thumbPlaceholder: {
    backgroundColor: theme.colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTextContainer: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  cardArtist: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginTop: 3,
  },
  optionsButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: theme.fonts.display,
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: "normal",
    letterSpacing: 0.8,
  },
  dragArea: {
    position: "relative",
  },
  trackRow: {
    position: "absolute",
    top: 0,
    left: 8,
    right: 8,
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderRadius: theme.radius.sm,
    zIndex: 1,
  },
  trackMainPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  trackRowDragging: {
    zIndex: 100,
    elevation: 12,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
  },
  trackTitleDragging: {
    color: theme.colors.primary,
  },
  dropSlot: {
    position: "absolute",
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderRadius: theme.radius.sm,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.primary,
    backgroundColor: "rgba(56, 189, 248, 0.08)",
    zIndex: 0,
  },
  dropSlotThumb: {
    opacity: 0.4,
  },
  dropSlotTitle: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: "600",
    opacity: 0.75,
  },
  dropSlotSubtitle: {
    color: theme.colors.textCyan,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
    opacity: 0.85,
  },
  dropSlotIcon: {
    padding: 8,
    opacity: 0.7,
  },
  trackThumbWrapper: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.sm,
    overflow: "hidden",
  },
  trackThumb: {
    width: 46,
    height: 46,
  },
  trackInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  trackTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  explicitBadge: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  explicitText: {
    color: "#d0d7de",
    fontSize: 10,
    fontWeight: "800",
  },
  trackArtist: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  reorderHandle: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
    // Web: a touch on the handle drags the row instead of panning the page
    ...(Platform.OS === "web"
      ? ({ touchAction: "none", userSelect: "none", cursor: "grab" } as object)
      : {}),
  },
  emptyQueuePrompt: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    height: ROW_HEIGHT,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  emptyQueueHidden: {
    opacity: 0,
  },
  emptyQueueText: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  nextUpHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: NEXT_UP_HEIGHT,
    marginBottom: 0,
  },
  nextUpTitle: {
    flex: 1,
  },
  modeButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  autoplayDivider: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    height: AUTOPLAY_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surfaceCardBorder,
  },
  autoplayDividerText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  fullEmptyContainer: {
    alignItems: "center",
    marginTop: 40,
    paddingHorizontal: 20,
  },
  exploreButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: theme.radius.full,
  },
  exploreButtonText: {
    color: theme.colors.playButtonIcon,
    fontWeight: "700",
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  modalItemText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "500",
  },
  modalCloseItem: {
    marginTop: 8,
    borderTopWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    justifyContent: "center",
  },
  modalCloseText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
});
