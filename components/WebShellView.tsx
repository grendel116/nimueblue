import React, { useEffect, useRef } from "react";
import { StyleSheet, View, BackHandler, StatusBar, Linking, AppState } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { checkForUpdates } from "@/scripts/appVersionCheck";
import TrackPlayer, { Event, useTrackPlayerEvents } from "react-native-track-player";
import * as SplashScreen from "expo-splash-screen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getPlayerHost } from "@/state/player/host";
import { chooseMusicFolder, openMusicFolder, rescanMusicFolder } from "@/scripts/musicFolder";
import { getDownloadedTracks } from "@/scripts/downloadManager";
import { removeDownloads, chooseAlbumCover } from "@/scripts/offlineFiles";
import { redirectSystemPath } from "@/app/+native-intent";
import { openInBrowser } from "@/scripts/openInBrowser";

export default function WebShellView() {
  const webViewRef = useRef<WebView>(null);
  const isWebReadyRef = useRef<boolean>(false);
  const pendingRouteRef = useRef<string | null>(null);

  const navigateWebToRoute = (route: string) => {
    if (!route || route === "/") return;
    if (isWebReadyRef.current && webViewRef.current) {
      const js = `(function() {
        if (typeof window.__nimueNavigate === 'function') {
          window.__nimueNavigate(${JSON.stringify(route)});
        } else {
          window.postMessage(${JSON.stringify({ type: "navigate", route })}, '*');
        }
      })(); true;`;
      webViewRef.current.injectJavaScript(js);
    } else {
      pendingRouteRef.current = route;
    }
  };

  useEffect(() => {
    checkForUpdates().catch((err) => console.warn("Update check failed:", err));

    const handleUrl = async (url: string | null, initial: boolean) => {
      if (!url) return;
      try {
        const route = await redirectSystemPath({ path: url, initial });
        if (route && route !== "/") {
          navigateWebToRoute(route);
        }
      } catch (err) {
        console.warn("Failed to resolve incoming URL in WebShellView:", url, err);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url, true);
    });

    const subscription = Linking.addEventListener("url", (event) => {
      handleUrl(event.url, false);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Handle hardware back button on Android: go back in web history if possible
  useEffect(() => {
    const onBackPress = () => {
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          (function() {
            if (window.history && window.history.length > 1) {
              window.history.back();
            }
          })();
          true;
        `);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, []);

  const postToWeb = (payload: Record<string, unknown>) => {
    webViewRef.current?.injectJavaScript(`window.postMessage(${JSON.stringify(payload)}, '*'); true;`);
  };

  // The player host lives here on the phone side; the web app shows every state it announces
  useEffect(() => getPlayerHost().subscribe((message) => postToWeb({ type: "player", message })), []);

  // Play/pause state and progress go straight from the audio player to the web app
  useTrackPlayerEvents([Event.PlaybackState, Event.PlaybackProgressUpdated], (event) => {
    if (event.type === Event.PlaybackState) {
      postToWeb({ type: event.type, state: event.state });
    } else {
      postToWeb({ type: event.type, position: event.position, duration: event.duration });
    }
  });

  // Coming back to the app (unlocking the screen), the web app gets the current state, since it
  // may have been asleep while songs played on
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") syncStateToWeb();
    });
    return () => sub.remove();
  }, []);

  const syncStateToWeb = async () => {
    try {
      const [{ state }, progress] = await Promise.all([
        TrackPlayer.getPlaybackState(),
        TrackPlayer.getProgress(),
      ]);
      postToWeb({ type: "sync", state, progress });
    } catch (e) {
      console.warn("Failed to sync playback to web:", e);
    }
    getPlayerHost().request({ type: "refresh" });
  };

  const onMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (!data || !data.type) return;

      switch (data.type) {
        case "player":
          getPlayerHost().request(data.request);
          break;
        case "webReady":
          isWebReadyRef.current = true;
          SplashScreen.hideAsync().catch(() => {});
          if (pendingRouteRef.current) {
            const pending = pendingRouteRef.current;
            pendingRouteRef.current = null;
            navigateWebToRoute(pending);
          }
          break;
        case "pickMusicFolder":
          try {
            const success = await chooseMusicFolder();
            await syncFolderToWeb();
            await syncDownloadsToWeb();
            replySuccess(data.id, success);
          } catch (err: any) {
            console.warn("pickMusicFolder error:", err);
            replyError(data.id, err?.message || "Failed to pick folder");
          }
          break;
        case "openMusicFolder":
          try {
            await openMusicFolder();
            await syncFolderToWeb();
            await syncDownloadsToWeb();
            replySuccess(data.id, true);
          } catch (err: any) {
            console.warn("openMusicFolder error:", err);
            replyError(data.id, err?.message || "Failed to open folder");
          }
          break;
        case "rescanMusicFolder":
          try {
            await rescanMusicFolder();
            await syncDownloadsToWeb();
            replySuccess(data.id, true);
          } catch (err: any) {
            console.warn("rescanMusicFolder error:", err);
            replyError(data.id, err?.message || "Failed to rescan folder");
          }
          break;
        case "removeDownloads":
          try {
            if (Array.isArray(data.ids)) {
              const tracks = await getDownloadedTracks();
              const idSet = new Set(data.ids);
              const toRemove = tracks.filter((t) => idSet.has(t.id));
              await removeDownloads(toRemove);
              await syncDownloadsToWeb();
            }
            replySuccess(data.id, true);
          } catch (err: any) {
            console.warn("removeDownloads error:", err);
            replyError(data.id, err?.message || "Failed to remove downloads");
          }
          break;
        case "chooseAlbumCover":
          try {
            if (data.key) {
              await chooseAlbumCover({ key: data.key } as any);
              await syncDownloadsToWeb();
            }
            replySuccess(data.id, true);
          } catch (err: any) {
            console.warn("chooseAlbumCover error:", err);
            replyError(data.id, err?.message || "Failed to choose cover");
          }
          break;
      }
    } catch (e) {
      console.warn("Failed to process message from WebView:", e);
    }
  };

  const replySuccess = (id: number | undefined, result: any) => {
    if (id === undefined) return;
    webViewRef.current?.injectJavaScript(
      `window.postMessage(${JSON.stringify({ type: "reply", id, result })}, '*'); true;`
    );
  };

  const replyError = (id: number | undefined, error: string) => {
    if (id === undefined) return;
    webViewRef.current?.injectJavaScript(
      `window.postMessage(${JSON.stringify({ type: "reply", id, error })}, '*'); true;`
    );
  };

  const syncFolderToWeb = async () => {
    try {
      const folderInfo = await AsyncStorage.getItem("mirlo_blue_music_folder_uri");
      const name = folderInfo
        ? decodeURIComponent(folderInfo).replace(/\/+$/, "").split(/[/:]/).pop() || "Music"
        : "";
      webViewRef.current?.injectJavaScript(
        `window.postMessage(${JSON.stringify({
          type: "musicFolder",
          status: folderInfo ? "ready" : "none",
          name,
        })}, '*'); true;`
      );
    } catch {}
  };

  const syncDownloadsToWeb = async () => {
    try {
      const tracks = await getDownloadedTracks();
      webViewRef.current?.injectJavaScript(
        `window.postMessage(${JSON.stringify({
          type: "downloads",
          tracks,
        })}, '*'); true;`
      );
    } catch (err) {
      console.warn("Failed to sync downloads to web:", err);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={false} barStyle="light-content" backgroundColor="#070b14" />
      <WebView
        ref={webViewRef}
        source={{ uri: "file:///android_asset/web/index.html" }}
        style={styles.webview}
        originWhitelist={["*"]}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mixedContentMode="always"
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        scalesPageToFit={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}
        onMessage={onMessage}
        // Pages the web app opens in a new window (checkouts, stores, downloads) go to a browser
        // tab named by package, so mirlo.space links don't loop back into this app
        onOpenWindow={(event) => openInBrowser(event.nativeEvent.targetUrl)}
        onError={() => SplashScreen.hideAsync().catch(() => {})}
        onLoadEnd={() => {
          syncStateToWeb();
          syncFolderToWeb();
          syncDownloadsToWeb();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#070b14",
  },
  webview: {
    flex: 1,
    backgroundColor: "#070b14",
  },
});
