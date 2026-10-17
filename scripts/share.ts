import { Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";

// The share hub serves short preview pages (/t/, /r/, /p/, /art/) with an Open in App button
export const NIMUE_BLUE_LISTEN_HUB =
  process.env.EXPO_PUBLIC_SHARE_HUB_URL ||
  "https://nimueblue-share.nimueblue.workers.dev";

// Short share page for a Mirlo artist
export function artistShareUrl(artistSlug: string): string {
  return `${new URL(NIMUE_BLUE_LISTEN_HUB).origin}/art/${encodeURIComponent(artistSlug)}`;
}

// Hands the message to the phone's share sheet. Browsers without a share sheet copy it
// to the clipboard instead; the result is true when the message was copied
export async function shareMessage(message: string, title: string): Promise<boolean> {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && !navigator.share) {
    await Clipboard.setStringAsync(message);
    return true;
  }
  try {
    await Share.share({ message, title });
  } catch {}
  return false;
}
