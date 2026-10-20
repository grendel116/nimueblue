import React, { useEffect, useRef } from "react";
import { StyleSheet, View, BackHandler, StatusBar, Linking } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { checkForUpdates } from "@/scripts/appVersionCheck";
import TrackPlayer, { Event, useTrackPlayerEvents } from "react-native-track-player";
import * as SplashScreen from "expo-splash-screen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ensureTrackPlayerInitialized } from "@/state/player/setup";
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

    ensureTrackPlayerInitialized().catch((err) => {
      console.warn("Failed to initialize native TrackPlayer in WebShellView:", err);
    });

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

  // Forward native TrackPlayer events into the WebView
  useTrackPlayerEvents(
    [
      Event.PlaybackState,
      Event.PlaybackActiveTrackChanged,
      Event.PlaybackProgressUpdated,
      Event.PlaybackQueueEnded,
      Event.PlaybackError,
    ],
    async (event) => {
      if (!webViewRef.current) return;
      const payload: Record<string, any> = { type: event.type };
      if (event.type === Event.PlaybackState) {
        payload.state = event.state;
      } else if (event.type === Event.PlaybackActiveTrackChanged) {
        payload.track = event.track;
        payload.index = event.index;
      } else if (event.type === Event.PlaybackProgressUpdated) {
        payload.position = event.position;
        payload.duration = event.duration;
      } else if (event.type === Event.PlaybackError) {
        payload.message = event.message;
        payload.code = (event as any).code;
      }
      const js = `window.postMessage(${JSON.stringify(payload)}, '*'); true;`;
      webViewRef.current.injectJavaScript(js);
    }
  );

  const syncStateToWeb = async () => {
    try {
      const [stateObj, activeIndex, activeTrack, progress] = await Promise.all([
        TrackPlayer.getPlaybackState().catch(() => ({ state: undefined })),
        TrackPlayer.getActiveTrackIndex().catch(() => undefined),
        TrackPlayer.getActiveTrack().catch(() => undefined),
        TrackPlayer.getProgress().catch(() => undefined),
      ]);
      const payload = {
        type: "sync",
        state: stateObj?.state,
        activeIndex,
        activeTrack,
        progress,
      };
      webViewRef.current?.injectJavaScript(
        `window.postMessage(${JSON.stringify(payload)}, '*'); true;`
      );
    } catch (e) {
      console.warn("Failed to sync state to web:", e);
    }
  };

  const onMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (!data || !data.type) return;

      switch (data.type) {
        case "setupPlayer":
          await ensureTrackPlayerInitialized();
          break;
        case "updateOptions":
          if (data.options) {
            await TrackPlayer.updateOptions(data.options);
          }
          break;
        case "setQueue":
          await ensureTrackPlayerInitialized();
          if (Array.isArray(data.queue)) {
            await TrackPlayer.setQueue(data.queue);
          }
          break;
        case "reset":
          await TrackPlayer.reset();
          break;
        case "play":
          await ensureTrackPlayerInitialized();
          await TrackPlayer.play();
          break;
        case "pause":
          await TrackPlayer.pause();
          break;
        case "stop":
          await TrackPlayer.stop();
          break;
        case "seekTo":
          if (typeof data.position === "number") {
            await TrackPlayer.seekTo(data.position);
          }
          break;
        case "skip":
          if (typeof data.index === "number") {
            await TrackPlayer.skip(data.index);
          }
          break;
        case "skipToNext":
          await TrackPlayer.skipToNext();
          break;
        case "skipToPrevious":
          await TrackPlayer.skipToPrevious();
          break;
        case "add":
          if (data.tracks) {
            await TrackPlayer.add(data.tracks, data.insertBeforeIndex);
          }
          break;
        case "remove":
          if (data.indexes !== undefined) {
            await TrackPlayer.remove(data.indexes);
          }
          break;
        case "move":
          if (typeof data.fromIndex === "number" && typeof data.toIndex === "number") {
            await TrackPlayer.move(data.fromIndex, data.toIndex);
          }
          break;
        case "removeUpcomingTracks":
          await TrackPlayer.removeUpcomingTracks();
          break;
        case "setRepeatMode":
          if (typeof data.mode === "number") {
            await TrackPlayer.setRepeatMode(data.mode);
          }
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
