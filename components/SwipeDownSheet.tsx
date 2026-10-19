import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { Platform, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import DismissModalBar from "@/components/DismissModalBar";
import { theme } from "@/constants/theme";

const SETTLE_MS = 220;
const FLICK_VELOCITY = 600;

type SheetScroll = {
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  scrollGesture: ReturnType<typeof Gesture.Native>;
};

const SheetScrollContext = createContext<SheetScroll | null>(null);
const SheetCloseContext = createContext<() => void>(() => {});

// Closes the sheet the way the down arrow does: it slides away, then the route leaves
export const useSheetClose = () => useContext(SheetCloseContext);

// A scrolling list inside a SwipeDownSheet. The sheet only follows a downward drag while the
// list is at its top
export function SheetScrollView(props: React.ComponentProps<typeof Animated.ScrollView>) {
  const sheet = useContext(SheetScrollContext);
  if (!sheet || Platform.OS === "web") return <Animated.ScrollView {...props} />;
  return (
    <GestureDetector gesture={sheet.scrollGesture}>
      <Animated.ScrollView
        {...props}
        onScroll={sheet.onScroll}
        scrollEventThrottle={16}
      />
    </GestureDetector>
  );
}

// The shell of every sheet that opens from a down arrow: the arrow bar on top, the content
// below, and a drag down anywhere (or on the bar alone, with `dragFromBarOnly`) that slides
// it away. `resetKey` brings the sheet back when the route is reopened with new params
export default function SwipeDownSheet({
  children,
  dragFromBarOnly = false,
  resetKey,
  style,
}: {
  children: React.ReactNode;
  dragFromBarOnly?: boolean;
  resetKey?: string;
  style?: ViewStyle;
}) {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const translateY = useSharedValue(0);
  const heightSv = useSharedValue(windowHeight);
  const scrollOffset = useSharedValue(0);
  const startedAtTop = useSharedValue(true);
  const closing = useRef(false);

  useEffect(() => {
    heightSv.value = windowHeight;
  }, [windowHeight, heightSv]);

  useEffect(() => {
    closing.current = false;
    translateY.value = 0;
  }, [resetKey, translateY]);

  const leave = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace("/");
  }, [router]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    translateY.value = withTiming(heightSv.value, { duration: SETTLE_MS }, (finished) => {
      if (finished) runOnJS(leave)();
    });
  }, [translateY, heightSv, leave]);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollOffset.value = event.contentOffset.y;
  });

  const scrollGesture = useMemo(() => Gesture.Native(), []);

  const dragGesture = useCallback(
    (needsTop: boolean, enabled: boolean) => {
      const pan = Gesture.Pan()
        .enabled(enabled)
        .activeOffsetY(10)
        .failOffsetX([-45, 45])
        .onStart(() => {
          startedAtTop.value = !needsTop || scrollOffset.value <= 10;
        })
        .onUpdate((event) => {
          if (!startedAtTop.value) return;
          translateY.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          if (!startedAtTop.value) return;
          const shouldClose =
            event.velocityY > FLICK_VELOCITY ||
            (event.velocityY > -FLICK_VELOCITY && translateY.value > heightSv.value * 0.25);
          translateY.value = withTiming(
            shouldClose ? heightSv.value : 0,
            { duration: SETTLE_MS },
            (finished) => {
              if (finished && shouldClose) runOnJS(leave)();
            },
          );
        });
      if (Platform.OS === "web") {
        return pan;
      }
      return needsTop ? pan.simultaneousWithExternalGesture(scrollGesture) : pan;
    },
    [scrollGesture, scrollOffset, startedAtTop, translateY, heightSv, leave],
  );

  const bodyGesture = useMemo(
    () => dragGesture(true, !dragFromBarOnly),
    [dragGesture, dragFromBarOnly],
  );
  const barGesture = useMemo(() => dragGesture(false, true), [dragGesture]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const scroll = useMemo(() => ({ onScroll, scrollGesture }), [onScroll, scrollGesture]);

  const isWeb = Platform.OS === "web";
  const content = (
    <SafeAreaView edges={["top"]} style={[styles.sheet, style]}>
      <GestureDetector gesture={barGesture}>
        <View>
          <DismissModalBar onPress={close} />
        </View>
      </GestureDetector>
      {children}
    </SafeAreaView>
  );

  return (
    <SheetCloseContext.Provider value={close}>
      <SheetScrollContext.Provider value={scroll}>
        <Animated.View style={[styles.sheet, sheetStyle]}>
          {isWeb ? content : <GestureDetector gesture={bodyGesture}>{content}</GestureDetector>}
        </Animated.View>
      </SheetScrollContext.Provider>
    </SheetCloseContext.Provider>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
