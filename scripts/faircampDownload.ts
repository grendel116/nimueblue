import { Linking, Platform } from "react-native";
import { fetchFaircampDownloadFormats } from "@/queries/fairplayer";
import { askChoice } from "./askChoice";

// Saves a Faircamp zip: the browser downloads it on web, the phone hands it to its browser
export function saveFaircampZip(url: string) {
  if (Platform.OS === "web") window.open(url, "_blank");
  else Linking.openURL(url);
}

// Reads a Faircamp downloads page and offers its formats in the app's format picker
export async function chooseFaircampDownload(downloadsUrl: string): Promise<void> {
  const formats = await fetchFaircampDownloadFormats(downloadsUrl);
  if (formats.length === 0) throw new Error("This release lists no downloads.");
  askChoice("Download Album", "Choose a format", [
    ...formats.map((f) => ({ text: f.label, onPress: () => saveFaircampZip(f.url) })),
    { text: "Cancel", style: "cancel" as const },
  ]);
}
