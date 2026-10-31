import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  findStation,
  registerDiscoveredStation,
  RadioStation,
  KS_CHITRA_STATION,
  fetchRadioStationById,
} from "@/queries/radio";

// Liked radio stations live on the phone: stations aren't Mirlo tracks, so local storage holds
// their bookmarked state along with station metadata for quick offline and restart access.

export type StationLike = {
  stationId: string;
  name?: string;
  liveName?: string;
  location?: string;
  artwork?: string;
  streamUrl?: string;
  playlistPage?: string;
  about?: string;
  tags?: string[];
  likedAt: number;
};

const STORAGE_KEY = "mirlo_blue_station_likes_v1";

let likes: StationLike[] = [];
let isLoaded = false;
let loaded: Promise<void> | null = null;
const listeners = new Set<(likes: StationLike[]) => void>();

function hydrateStation(like: StationLike) {
  if (like.stationId === "rb-0dfae06a5e7b438aa509aaacd94bc6b2") {
    like.name = like.name || KS_CHITRA_STATION.name;
    like.liveName = like.liveName || KS_CHITRA_STATION.liveName;
    like.location = like.location || KS_CHITRA_STATION.location;
    like.artwork = like.artwork || KS_CHITRA_STATION.artwork;
    like.streamUrl = like.streamUrl || KS_CHITRA_STATION.streamUrl;
    like.playlistPage = like.playlistPage || KS_CHITRA_STATION.playlistPage;
    registerDiscoveredStation(KS_CHITRA_STATION);
    return;
  }
  if (like.name && like.streamUrl) {
    registerDiscoveredStation({
      id: like.stationId,
      name: like.name,
      liveName: like.liveName || like.name,
      location: like.location || "Autonomous / Global",
      artwork: like.artwork || "",
      about: like.about || `${like.name} — Radio broadcast from ${like.location || "Autonomous / Global"}.`,
      streamUrl: like.streamUrl,
      playlistPage: like.playlistPage || "",
      donatePage: like.playlistPage || "",
      tags: like.tags,
      fetchPlays: async () => [],
    });
  }
}

function load(): Promise<void> {
  loaded ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      const parsed = raw ? JSON.parse(raw) : [];
      likes = Array.isArray(parsed) ? parsed : [];
      let needsSave = false;
      for (const like of likes) {
        hydrateStation(like);
        if (like.stationId === "rb-0dfae06a5e7b438aa509aaacd94bc6b2" && !like.streamUrl) {
          like.name = KS_CHITRA_STATION.name;
          like.liveName = KS_CHITRA_STATION.liveName;
          like.location = KS_CHITRA_STATION.location;
          like.artwork = KS_CHITRA_STATION.artwork;
          like.streamUrl = KS_CHITRA_STATION.streamUrl;
          like.playlistPage = KS_CHITRA_STATION.playlistPage;
          needsSave = true;
        }
      }
      if (needsSave) {
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(likes)).catch(() => {});
      }
      isLoaded = true;
      listeners.forEach((listener) => listener(likes));

      for (const like of likes) {
        if (!like.streamUrl && like.stationId.startsWith("rb-")) {
          fetchRadioStationById(like.stationId).then((st) => {
            if (st) {
              like.name = st.name;
              like.liveName = st.liveName;
              like.location = st.location;
              like.artwork = st.artwork;
              like.streamUrl = st.streamUrl;
              like.playlistPage = st.playlistPage;
              like.about = st.about;
              like.tags = st.tags;
              listeners.forEach((listener) => listener(likes));
              AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(likes)).catch(() => {});
            }
          });
        }
      }
    })
    .catch((err) => {
      isLoaded = true;
      console.error("Failed to load station likes:", err);
    });
  return loaded;
}

export async function toggleStationLike(
  stationId: string,
  details?: Partial<RadioStation> | RNTrack,
): Promise<void> {
  await load();
  if (likes.some((like) => like.stationId === stationId)) {
    likes = likes.filter((like) => like.stationId !== stationId);
  } else {
    const existingStation = findStation(stationId);
    const rnTrack = details && "url" in details ? (details as RNTrack) : undefined;
    const partialStation = details && "streamUrl" in details ? (details as Partial<RadioStation>) : undefined;

    let name =
      partialStation?.name ||
      partialStation?.liveName ||
      rnTrack?.title ||
      existingStation?.name ||
      (stationId === "rb-0dfae06a5e7b438aa509aaacd94bc6b2" ? KS_CHITRA_STATION.name : "Radio Station");

    let liveName =
      partialStation?.liveName ||
      partialStation?.name ||
      rnTrack?.title ||
      existingStation?.liveName ||
      name;

    let location =
      partialStation?.location ||
      (rnTrack?.artist ? rnTrack.artist.replace(/^Live from /, "") : undefined) ||
      existingStation?.location ||
      (stationId === "rb-0dfae06a5e7b438aa509aaacd94bc6b2" ? KS_CHITRA_STATION.location : "Autonomous / Global");

    let artwork =
      partialStation?.artwork ||
      rnTrack?.artwork ||
      existingStation?.artwork ||
      (stationId === "rb-0dfae06a5e7b438aa509aaacd94bc6b2" ? KS_CHITRA_STATION.artwork : "");

    let streamUrl =
      partialStation?.streamUrl ||
      rnTrack?.url ||
      existingStation?.streamUrl ||
      (stationId === "rb-0dfae06a5e7b438aa509aaacd94bc6b2" ? KS_CHITRA_STATION.streamUrl : "");

    let playlistPage =
      partialStation?.playlistPage ||
      existingStation?.playlistPage ||
      (stationId === "rb-0dfae06a5e7b438aa509aaacd94bc6b2" ? KS_CHITRA_STATION.playlistPage : "");

    let about =
      partialStation?.about ||
      existingStation?.about ||
      (stationId === "rb-0dfae06a5e7b438aa509aaacd94bc6b2" ? KS_CHITRA_STATION.about : undefined);

    let tags = partialStation?.tags || existingStation?.tags;

    const newLike: StationLike = {
      stationId,
      name,
      liveName,
      location,
      artwork,
      streamUrl,
      playlistPage,
      about,
      tags,
      likedAt: Date.now(),
    };

    hydrateStation(newLike);
    likes = [newLike, ...likes];
  }

  listeners.forEach((listener) => listener(likes));
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(likes));
  } catch (err) {
    console.error("Failed to save station likes:", err);
  }
}

export function useStationLikes(): StationLike[] {
  const [current, setCurrent] = useState(likes);
  useEffect(() => {
    listeners.add(setCurrent);
    if (isLoaded) {
      setCurrent((prev) => (prev === likes ? prev : likes));
    } else {
      load();
    }
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  return current;
}
