// Project-local entry point. Android runs only the WebView shell; every other platform runs
// expo-router. Metro drops the untaken branch when it inlines Platform.OS, so the Android
// bundle leaves out the router and every screen.
import { Platform } from "react-native";

if (Platform.OS === "android") {
  require("./scripts/androidShell");
} else {
  require("expo-router/entry");
}
