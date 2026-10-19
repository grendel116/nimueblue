import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  View,
} from "react-native";
import DropletSpinner from "@/components/DropletSpinner";
import { theme } from "@/constants/theme";

interface PullToRefreshViewProps extends ScrollViewProps {
  refreshing: boolean;
  onRefresh: () => void | Promise<unknown>;
  children: React.ReactNode;
}

const THRESHOLD = 55;
const MAX_PULL = 85;
const DECIDE_PX = 4;

function scrolledToTop(target: EventTarget | null, root: HTMLElement): boolean {
  for (let node = target as HTMLElement | null; node && node !== root; node = node?.parentElement ?? null) {
    if (node.scrollTop > 0) return false;
  }
  return true;
}

export default function PullToRefreshView({
  refreshing,
  onRefresh,
  children,
  style,
  contentContainerStyle,
  ...rest
}: PullToRefreshViewProps) {
  const wrapperRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const pullAnim = useRef(new Animated.Value(0)).current;
  const [isPulling, setIsPulling] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Animate indicator when refreshing state changes
  useEffect(() => {
    if (refreshing) {
      Animated.spring(pullAnim, {
        toValue: 64,
        useNativeDriver: true,
        bounciness: 6,
      }).start();
    } else {
      Animated.timing(pullAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => setIsPulling(false));
    }
  }, [refreshing, pullAnim]);

  // Touch listener for web and Android WebView where react-native-web's RefreshControl is a no-op
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const domNode = wrapperRef.current as unknown as HTMLElement | null;
    if (!domNode?.addEventListener) return;

    let state: "idle" | "undecided" | "pulling" | "scrolling" = "idle";
    let startX = 0;
    let startY = 0;
    let distance = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        state = "idle";
        return;
      }
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      distance = 0;
      state = scrolledToTop(e.target, domNode) ? "undecided" : "scrolling";
    };

    const onTouchMove = (e: TouchEvent) => {
      if (state === "idle" || state === "scrolling" || refreshing) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (state === "undecided") {
        if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
        state = dy > Math.abs(dx) ? "pulling" : "scrolling";
        if (state === "scrolling") return;
      }

      if (state === "pulling") {
        if (e.cancelable) e.preventDefault();
        distance = Math.min(MAX_PULL, Math.max(0, dy * 0.45));
        pullAnim.setValue(distance);
        setIsPulling(true);
      }
    };

    const onTouchEnd = () => {
      if (state === "pulling") {
        if (distance >= THRESHOLD && !refreshing) {
          onRefreshRef.current();
        } else if (!refreshing) {
          Animated.timing(pullAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }).start(() => setIsPulling(false));
        }
      }
      state = "idle";
    };

    domNode.addEventListener("touchstart", onTouchStart, { passive: true });
    domNode.addEventListener("touchmove", onTouchMove, { passive: false });
    domNode.addEventListener("touchend", onTouchEnd, { passive: true });
    domNode.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      domNode.removeEventListener("touchstart", onTouchStart);
      domNode.removeEventListener("touchmove", onTouchMove);
      domNode.removeEventListener("touchend", onTouchEnd);
      domNode.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [refreshing, pullAnim]);

  const showIndicator = refreshing || isPulling;

  return (
    <View ref={wrapperRef} style={styles.wrapper}>
      {showIndicator && (
        <Animated.View
          style={[
            styles.indicatorContainer,
            {
              transform: [
                {
                  translateY: pullAnim.interpolate({
                    inputRange: [0, MAX_PULL],
                    outputRange: [-64, 40],
                    extrapolate: "clamp",
                  }),
                },
              ],
              opacity: pullAnim.interpolate({
                inputRange: [0, 20, THRESHOLD],
                outputRange: [0, 0.7, 1],
                extrapolate: "clamp",
              }),
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.pill}>
            <DropletSpinner size={24} />
          </View>
        </Animated.View>
      )}

      <ScrollView
        ref={scrollRef}
        style={style}
        contentContainerStyle={contentContainerStyle}
        refreshControl={
          Platform.OS !== "web" ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
              progressBackgroundColor={theme.colors.surfaceElevated}
              progressViewOffset={24}
            />
          ) : undefined
        }
        {...rest}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  indicatorContainer: {
    position: "absolute",
    top: 14,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
  },
  pill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
});
