import { registerRootComponent } from "expo";
import * as SplashScreen from "expo-splash-screen";
import TrackPlayer from "react-native-track-player";
import WebShellView from "@/components/WebShellView";

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 500, fade: true });

TrackPlayer.registerPlaybackService(() => require("./service"));

registerRootComponent(WebShellView);
