import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { Alert, Linking, Platform } from "react-native";
import { askChoice } from "./askChoice";

const GITHUB_LATEST_RELEASE_URL =
  "https://api.github.com/repos/grendel116/nimueblue/releases/latest";
const NIMUE_BLUE_DOWNLOAD_PAGE = "https://grendel116.github.io/nimueblue/";

export async function checkEASUpdate() {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch (err) {
    console.log("EAS update check bypassed:", err);
  }
}

export async function checkForUpdates() {
  try {
    checkEASUpdate().catch(() => {});

    const currentVersion =
      Platform.OS === "android"
        ? Application.nativeApplicationVersion || Application.nativeBuildVersion
        : Application.nativeBuildVersion;
    const bundleId = Application.applicationId;

    if (!bundleId && Platform.OS === "ios") {
      console.log("couldn't get bundleId");
      return false;
    }

    if (!currentVersion) {
      console.log("couldn't get current version");
      return false;
    }

    console.log(`Checking for updates. Current version: ${currentVersion}`);

    let storeVersion: string | null = null;
    let storeUrl: string | null = null;

    if (Platform.OS === "ios") {
      const result = await checkiOSVersion(bundleId);
      storeVersion = result.version;
      storeUrl = result.url;
    } else if (Platform.OS === "android") {
      const result = await checkAndroidVersion();
      storeVersion = result.version;
      storeUrl = result.url;
    } else {
      console.log("Platform not supported for version checking");
      return false;
    }

    if (!storeVersion || !storeUrl) {
      console.log("Could not fetch store version");
      return false;
    }

    console.log(`Store version: ${storeVersion}`);

    // Compare versions
    if (isVersionGreater(storeVersion, currentVersion)) {
      if (Platform.OS === "android") {
        showAndroidUpdatePrompt(currentVersion, storeVersion, storeUrl);
      } else {
        showForceUpdateAlert(currentVersion, storeVersion, storeUrl);
      }
      return true;
    } else {
      console.log("App is up to date");
    }

    return false;
  } catch (err) {
    console.error("Version check failed", err);
    return false;
  }
}

async function checkiOSVersion(bundleId: string | null) {
  try {
    const response = await fetch(
      `https://itunes.apple.com/lookup?bundleId=${bundleId}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const appData = data.results[0];
      return {
        version: appData.version,
        url: appData.trackViewUrl,
        releaseNotes: appData.releaseNotes,
        releaseDate: appData.currentVersionReleaseDate,
      };
    } else {
      throw new Error("App not found in App Store");
    }
  } catch (error) {
    console.log("iOS version check failed:", error);
    return { version: null, url: null };
  }
}

export async function checkAndroidVersion() {
  try {
    const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawVersion = String(data?.tag_name || data?.name || "").trim();
    const cleanVersion = rawVersion.replace(/^v/i, "");
    if (!cleanVersion) {
      return { version: null, url: null };
    }

    const apkAsset = Array.isArray(data?.assets)
      ? data.assets.find(
          (a: any) =>
            typeof a?.name === "string" &&
            a.name.endsWith(".apk") &&
            typeof a?.browser_download_url === "string" &&
            a.browser_download_url.length > 0,
        )
      : null;

    const downloadUrl =
      apkAsset?.browser_download_url ||
      data?.html_url ||
      NIMUE_BLUE_DOWNLOAD_PAGE;

    return {
      version: cleanVersion,
      url: downloadUrl,
    };
  } catch (error) {
    console.log("Android version check failed:", error);
    return { version: null, url: null };
  }
}

function showAndroidUpdatePrompt(
  currentVersion: string | null,
  newVersion: string,
  downloadUrl: string,
) {
  askChoice(
    "Update Available",
    `NimueBlue ${newVersion} is ready to install (you have ${currentVersion}). Download and install the latest APK update?`,
    [
      {
        text: "Install Update",
        onPress: () => Linking.openURL(downloadUrl),
      },
      {
        text: "Later",
        style: "cancel",
      },
    ],
  );
}

function showForceUpdateAlert(
  currentVersion: string | null,
  newVersion: string,
  storeUrl: string
) {
  // Use iTunes URL in simulator, App Store URL on device
  const appStoreUrl =
    __DEV__ && Platform.OS === "ios"
      ? "https://www.apple.com/app-store/" // Keep original iTunes URL for simulator
      : storeUrl;

  console.log(appStoreUrl);

  Alert.alert(
    "Update Required",
    `This version (${currentVersion}) is no longer supported. Please update to version ${newVersion} to continue using the app.`,
    [
      {
        text: "Update Now",
        onPress: () => Linking.openURL(appStoreUrl),
      },
    ],
    {
      cancelable: false,
      onDismiss: () => {
        // Re-show alert if dismissed
        setTimeout(
          () => showForceUpdateAlert(currentVersion, newVersion, storeUrl),
          1000
        );
      },
    }
  );
}

// Version comparison helper
export function compareVersions(version1: string, version2: string) {
  // Clean versions (remove any non-numeric characters except dots)
  const v1 = version1
    .replace(/[^\d.]/g, "")
    .split(".")
    .map(Number);
  const v2 = version2
    .replace(/[^\d.]/g, "")
    .split(".")
    .map(Number);

  // Pad arrays to same length
  const maxLength = Math.max(v1.length, v2.length);
  while (v1.length < maxLength) v1.push(0);
  while (v2.length < maxLength) v2.push(0);

  // Compare each part
  for (let i = 0; i < maxLength; i++) {
    if (v1[i] > v2[i]) return 1;
    if (v1[i] < v2[i]) return -1;
  }
  return 0; // Equal
}

// Helper functions
export function isVersionGreater(version1: string, version2: string) {
  return compareVersions(version1, version2) > 0;
}
