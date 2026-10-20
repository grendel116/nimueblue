import * as Application from "expo-application";
import { Alert, Linking, Platform } from "react-native";

const GITHUB_LATEST_RELEASE_URL =
  "https://api.github.com/repos/grendel116/nimueblue/releases/latest";
const NIMUE_BLUE_DOWNLOAD_PAGE = "https://grendel116.github.io/nimueblue/";

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

export function showAndroidUpdatePrompt(
  currentVersion: string | null,
  newVersion: string,
  downloadUrl: string,
) {
  Alert.alert(
    "Update Available",
    `NimueBlue ${newVersion} is ready to install (you have ${currentVersion}). Download and install the latest APK update?`,
    [
      {
        text: "Later",
        style: "cancel",
      },
      {
        text: "Install Update",
        onPress: () => Linking.openURL(downloadUrl),
      },
    ],
  );
}

// Version comparison helper
export function compareVersions(version1: string, version2: string) {
  const v1 = version1
    .replace(/[^\d.]/g, "")
    .split(".")
    .map(Number);
  const v2 = version2
    .replace(/[^\d.]/g, "")
    .split(".")
    .map(Number);

  const maxLength = Math.max(v1.length, v2.length);
  while (v1.length < maxLength) v1.push(0);
  while (v2.length < maxLength) v2.push(0);

  for (let i = 0; i < maxLength; i++) {
    if (v1[i] > v2[i]) return 1;
    if (v1[i] < v2[i]) return -1;
  }
  return 0;
}

export function isVersionGreater(version1: string, version2: string) {
  return compareVersions(version1, version2) > 0;
}

export async function checkForUpdates(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }

  try {
    const currentVersion =
      Application.nativeApplicationVersion || Application.nativeBuildVersion;

    if (!currentVersion) {
      console.log("Could not get current native version");
      return false;
    }

    const { version: latestVersion, url: downloadUrl } = await checkAndroidVersion();

    if (!latestVersion || !downloadUrl) {
      return false;
    }

    if (isVersionGreater(latestVersion, currentVersion)) {
      showAndroidUpdatePrompt(currentVersion, latestVersion, downloadUrl);
      return true;
    }

    return false;
  } catch (err) {
    console.warn("Version check failed:", err);
    return false;
  }
}
