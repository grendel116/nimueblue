import { Stack, useRouter } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SearchContextProvider } from "@/state/SearchContext";
import { PlayerContextProvider } from "@/state/PlayerContext";
import { QueryClientWrapper } from "@/queries/QueryClientWrapper";
import { StatusBar } from "expo-status-bar";
import TrackPlayer from "react-native-track-player";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { AppReadyContextProvider } from "@/state/AppReadyContext";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { MEDIEVAL_FONT_BASE64 } from "@/constants/medievalFontBase64";
import Ionicons from "@expo/vector-icons/Ionicons";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import Footer from "@/components/Footer";
import NowPlaying from "@/components/NowPlaying";
import ChoiceSheet from "@/components/ChoiceSheet";
import { theme } from "@/constants/theme";
import { openMusicFolder } from "@/scripts/musicFolder";

SplashScreen.preventAutoHideAsync();

// Keep the home screen under deep-linked routes: it is what hides the splash
// once data loads, and Back then returns home instead of leaving the app
export const unstable_settings = { anchor: "index" };

SplashScreen.setOptions({
  duration: 500,
  fade: true,
});

TrackPlayer.registerPlaybackService(() => require("../scripts/service"));

export default function RootLayout() {
  const router = useRouter();
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);
  const [fontsLoaded, fontError] = useFonts({
    MedievalScroll: require("../assets/fonts/Medieval-Scroll-of-Wisdom.ttf"),
    OpenSans: require("../assets/fonts/OpenSans-VariableFont_wdth,wght.ttf"),
    ...Ionicons.font,
    ...FontAwesome6.font,
  });

  // Handle deep link navigation requested by the native shell
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const navigateTo = (route: string) => {
      if (!route) return;
      try {
        router.navigate(route as any);
      } catch {
        try {
          router.push(route as any);
        } catch (err) {
          console.warn("Failed to navigate to route:", route, err);
        }
      }
    };

    (window as any).__nimueNavigate = navigateTo;

    const onMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "navigate" && typeof data.route === "string") {
          navigateTo(data.route);
        }
      } catch {}
    };

    window.addEventListener("message", onMessage);
    return () => {
      delete (window as any).__nimueNavigate;
      window.removeEventListener("message", onMessage);
    };
  }, [router]);

  useEffect(() => {
    openMusicFolder().catch((err) => console.warn("Couldn't reopen the music folder:", err));
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const styleId = "medieval-scroll-font-face";
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
          @font-face {
            font-family: 'MedievalScroll';
            src: url('${MEDIEVAL_FONT_BASE64}') format('truetype');
            font-weight: normal;
            font-style: normal;
            font-display: swap;
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  useEffect(() => {
    // Reveal the app once fonts are ready and Home has loaded its first content.
    // After 4 seconds the app is revealed anyway so an offline start never stays on the splash.
    if (!fontsLoaded && !fontError) return;

    const reveal = () => {
      SplashScreen.hide();
      if (
        Platform.OS === "web" &&
        typeof window !== "undefined" &&
        Boolean((window as any).ReactNativeWebView)
      ) {
        (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: "webReady" }));
      }
    };

    if (isDataLoaded) {
      reveal();
      return;
    }
    const fallbackTimer = setTimeout(reveal, 4000);
    return () => clearTimeout(fallbackTimer);
  }, [fontsLoaded, fontError, isDataLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <AppReadyContextProvider
      value={{ isDataLoaded: isDataLoaded, setIsDataLoaded: setIsDataLoaded }}
    >
      <QueryClientWrapper>
          <PlayerContextProvider>
            <SearchContextProvider>
              <>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    animation: "none",
                    contentStyle: { backgroundColor: theme.colors.background },
                  }}
                >
                  <Stack.Screen
                    name="index"
                    options={{
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="feed"
                    options={{
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="library"
                    options={{
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="artist/[id]"
                    options={{
                      headerShown: false,
                      animation: "none",
                    }}
                  />
                  <Stack.Screen
                    name="now-playing"
                    options={{
                      headerShown: false,
                      presentation: "transparentModal",
                    }}
                  />
                  <Stack.Screen
                    name="search"
                    options={{
                      headerShown: false,
                      animation: "fade",
                      animationDuration: 300,
                      presentation: "transparentModal",
                    }}
                  />
                  <Stack.Screen
                    name="tags/[tag]"
                    options={{
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="station/[id]"
                    options={{
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="podcast/[id]"
                    options={{
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="mostPlayed"
                    options={{
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="topSold"
                    options={{
                      headerShown: false,
                    }}
                  />

                  <Stack.Screen
                    name="aboutModal"
                    options={{
                      headerShown: false,
                      presentation: "transparentModal",
                      animation: "slide_from_bottom",
                      animationDuration: 200,
                      contentStyle: { backgroundColor: "transparent" },
                    }}
                  />
                  <Stack.Screen
                    name="supportModal"
                    options={{
                      headerShown: false,
                      presentation: "transparentModal",
                      animation: "slide_from_bottom",
                      animationDuration: 200,
                      contentStyle: { backgroundColor: "transparent" },
                    }}
                  />
                </Stack>
                <NowPlaying />
              </>
              <Footer />
              <ChoiceSheet />
              <StatusBar style="light" backgroundColor={theme.colors.background} />
            </SearchContextProvider>
          </PlayerContextProvider>
      </QueryClientWrapper>
    </AppReadyContextProvider>
    </GestureHandlerRootView>
  );
}

