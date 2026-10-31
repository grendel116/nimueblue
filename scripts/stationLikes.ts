import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  fetchRadioStationById,
  findStation,
  registerDiscoveredStation,
  RadioStation,
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
const DEFAULT_LOCATION = "Autonomous / Global";

let likes: StationLike[] = [];
let isLoaded = false;
let loaded: Promise<void> | null = null;
const listeners = new Set<(likes: StationLike[]) => void>();

// The station a saved like describes, if it holds enough to play it
export function stationFromLike(like: StationLike): RadioStation | undefined {
  if (!like.name || !like.streamUrl) return undefined;
  const location = like.location || DEFAULT_LOCATION;
  return {
    id: like.stationId,
    name: like.name,
    liveName: like.liveName || like.name,
    location,
    artwork: like.artwork || "",
    about: like.about || `${like.name} — Radio broadcast from ${location}.`,
    streamUrl: like.streamUrl,
    playlistPage: like.playlistPage || "",
    donatePage: like.playlistPage || "",
    tags: like.tags,
    fetchPlays: async () => [],
  };
}

function likeFromStation(station: RadioStation, likedAt: number): StationLike {
  return {
    stationId: station.id,
    name: station.name,
    liveName: station.liveName,
    location: station.location,
    artwork: station.artwork,
    streamUrl: station.streamUrl,
    playlistPage: station.playlistPage,
    about: station.about,
    tags: station.tags,
    likedAt,
  };
}

// Stations saved from a track the player holds: station details are read back off the track
function stationFromTrack(stationId: string, track: RNTrack): RadioStation | undefined {
  if (!track.url) return undefined;
  return stationFromLike({
    stationId,
    name: track.title,
    location: track.artist?.replace(/^Live from /, ""),
    artwork: track.artwork,
    streamUrl: track.url,
    likedAt: 0,
  });
}

function publish(next: StationLike[]) {
  likes = next;
  listeners.forEach((listener) => listener(likes));
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(likes)).catch((err) =>
    console.error("Failed to save station likes:", err),
  );
}

// Likes saved before station details were kept fetch them once, then replace the list so
// subscribers see the change
function fillMissingDetails(stationId: string) {
  fetchRadioStationById(stationId)
    .then((station) => {
      if (!station) return;
      publish(
        likes.map((like) =>
          like.stationId === stationId ? likeFromStation(station, like.likedAt) : like,
        ),
      );
    })
    .catch(() => {});
}

function load(): Promise<void> {
  loaded ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      const parsed = raw ? JSON.parse(raw) : [];
      likes = Array.isArray(parsed) ? parsed : [];
      for (const like of likes) {
        const station = stationFromLike(like);
        if (station) registerDiscoveredStation(station);
      }
      isLoaded = true;
      listeners.forEach((listener) => listener(likes));
      likes.filter((like) => !like.streamUrl).forEach((like) => fillMissingDetails(like.stationId));
    })
    .catch((err) => {
      isLoaded = true;
      console.error("Failed to load station likes:", err);
    });
  return loaded;
}

export async function toggleStationLike(stationId: string, track?: RNTrack): Promise<void> {
  await load();
  if (likes.some((like) => like.stationId === stationId)) {
    publish(likes.filter((like) => like.stationId !== stationId));
    return;
  }
  const station = findStation(stationId) ?? (track && stationFromTrack(stationId, track));
  if (!station) {
    console.error("Cannot bookmark unknown station:", stationId);
    return;
  }
  registerDiscoveredStation(station);
  publish([likeFromStation(station, Date.now()), ...likes]);
}

export function useStationLikes(): StationLike[] {
  const [current, setCurrent] = useState(likes);
  useEffect(() => {
    listeners.add(setCurrent);
    if (isLoaded) {
      setCurrent(likes);
    } else {
      load();
    }
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  return current;
}
