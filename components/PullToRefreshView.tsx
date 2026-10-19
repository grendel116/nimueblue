import React, { useEffect, useRef, useState, useCallback } from "react";
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

export default function PullToRefreshView({
  refreshing,
  onRefresh,
  children,
  style,
  contentContainerStyle,
  ...rest
}: PullToRefreshViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const pullAnim = useRef(new Animated.Value(0)).current;
  const [isPulling, setIsPulling] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Animate indicator when refreshing state changes
  useEffect(() => {
    if (refreshing) {
      Animated.spring(pullAnim, {
        toValue: 56,
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

    const scrollNode = (scrollRef.current as any)?.getScrollableNode?.() || scrollRef.current;
    const domNode: HTMLElement | null = scrollNode instanceof HTMLElement ? scrollNode : null;
    if (!domNode) return;

    let startY = 0;
    let pulling = false;
    let distance = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (domNode.scrollTop <= 1) {
        startY = e.touches[0].clientY;
        pulling = true;
        distance = 0;
      } else {
        pulling = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling || refreshing) return;
      if (domNode.scrollTop > 1) {
        pulling = false;
        pullAnim.setValue(0);
        return;
      }

      const currentY = e.touches[0].clientY;
      const dy = currentY - startY;

      if (dy > 0) {
        // Resistance curve
        distance = Math.min(MAX_PULL, dy * 0.45);
        pullAnim.setValue(distance);
        setIsPulling(true);

        if (e.cancelable && distance > 10) {
          e.preventDefault();
        }
      } else {
        pulling = false;
        pullAnim.setValue(0);
      }
    };

    const onTouchEnd = () => {
      if (!pulling && !isPulling) return;
      pulling = false;

      if (distance >= THRESHOLD && !refreshing) {
        onRefreshRef.current();
      } else if (!refreshing) {
        Animated.timing(pullAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }).start(() => setIsPulling(false));
      }
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
  }, [refreshing, pullAnim, isPulling]);

  const showIndicator = refreshing || isPulling;

  return (
    <View style={styles.wrapper}>
      {showIndicator && (
        <Animated.View
          style={[
            styles.indicatorContainer,
            {
              transform: [
                {
                  translateY: pullAnim.interpolate({
                    inputRange: [0, MAX_PULL],
                    outputRange: [-48, 16],
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
    top: 0,
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
