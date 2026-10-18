import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { findPodcastShow } from "@/queries/podcast";

// Bookmarked podcasts live on the phone: episodes aren't Mirlo tracks, so local storage holds
// their bookmarked state. A show is the album of its episodes: bookmarking an episode bookmarks
// its show, and un-bookmarking a show's last episode removes the show.

export type PodcastEpisodeLike = {
  episodeId: string;
  showId: string;
  title: string;
  artist: string;
  url: string;
  artwork?: string;
  duration?: number;
  pubDate?: string;
  likedAt: number;
};

export type PodcastShowBookmark = {
  showId: string;
  name: string;
  author: string;
  artwork: string;
  bookmarkedAt: number;
};

type Bookmarks = { episodes: PodcastEpisodeLike[]; shows: PodcastShowBookmark[] };

const EPISODES_KEY = "mirlo_blue_podcast_episode_likes_v1";
const SHOWS_KEY = "mirlo_blue_podcast_show_bookmarks_v1";

let current: Bookmarks = { episodes: [], shows: [] };
let isLoaded = false;
let loaded: Promise<void> | null = null;
const listeners = new Set<(bookmarks: Bookmarks) => void>();

function publish(): void {
  listeners.forEach((listener) => listener(current));
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(EPISODES_KEY, JSON.stringify(current.episodes));
    await AsyncStorage.setItem(SHOWS_KEY, JSON.stringify(current.shows));
  } catch (err) {
    console.error("Failed to save podcast bookmarks:", err);
  }
}

function showEntry(showId: string, fallback: Partial<PodcastShowBookmark> = {}): PodcastShowBookmark {
  const show = findPodcastShow(showId);
  return {
    showId,
    name: show?.name || fallback.name || "Podcast",
    author: show?.author || fallback.author || "",
    artwork: show?.artwork || fallback.artwork || "",
    bookmarkedAt: fallback.bookmarkedAt ?? Date.now(),
  };
}

function load(): Promise<void> {
  loaded ??= Promise.all([AsyncStorage.getItem(EPISODES_KEY), AsyncStorage.getItem(SHOWS_KEY)])
    .then(([rawEpisodes, rawShows]) => {
      const episodes = rawEpisodes ? JSON.parse(rawEpisodes) : [];
      const shows = rawShows ? JSON.parse(rawShows) : [];
      current = {
        episodes: Array.isArray(episodes) ? episodes : [],
        shows: Array.isArray(shows) ? shows : [],
      };
      // Episodes bookmarked before shows had bookmarks bring their show along
      for (const episode of current.episodes) {
        if (episode.showId && !current.shows.some((s) => s.showId === episode.showId)) {
          current.shows = [
            ...current.shows,
            showEntry(episode.showId, { bookmarkedAt: episode.likedAt }),
          ];
        }
      }
      isLoaded = true;
      publish();
    })
    .catch((err) => {
      isLoaded = true;
      console.error("Failed to load podcast bookmarks:", err);
    });
  return loaded;
}

export async function togglePodcastEpisodeLike(item: {
  podcastEpisodeId: string;
  podcastId?: string;
  title?: string;
  artist?: string;
  url?: string;
  artwork?: string;
  duration?: number;
  pubDate?: string;
  trackGroup?: { title?: string };
}): Promise<void> {
  await load();
  const showId = item.podcastId || "";
  const exists = current.episodes.some((l) => l.episodeId === item.podcastEpisodeId);
  const episodes = exists
    ? current.episodes.filter((l) => l.episodeId !== item.podcastEpisodeId)
    : [
        {
          episodeId: item.podcastEpisodeId,
          showId,
          title: item.title || "Episode",
          artist: item.artist || "Podcast",
          url: item.url || "",
          artwork: item.artwork || "",
          duration: item.duration || 0,
          pubDate: item.pubDate || "",
          likedAt: Date.now(),
        },
        ...current.episodes,
      ];

  let shows = current.shows;
  if (showId) {
    if (!exists) {
      if (!shows.some((s) => s.showId === showId)) {
        shows = [
          showEntry(showId, {
            name: item.trackGroup?.title,
            author: item.artist,
            artwork: item.artwork,
          }),
          ...shows,
        ];
      }
    } else if (!episodes.some((l) => l.showId === showId)) {
      shows = shows.filter((s) => s.showId !== showId);
    }
  }

  current = { episodes, shows };
  publish();
  await persist();
}

export function isPodcastShowBookmarked(showId: string, bookmarks: Bookmarks = current): boolean {
  return (
    bookmarks.shows.some((s) => s.showId === showId) ||
    bookmarks.episodes.some((l) => l.showId === showId)
  );
}

// Bookmarks a show, or removes it along with the bookmarked episodes it holds
export async function togglePodcastShowBookmark(show: {
  id: string;
  name: string;
  author: string;
  artwork: string;
}): Promise<void> {
  await load();
  if (isPodcastShowBookmarked(show.id)) {
    current = {
      episodes: current.episodes.filter((l) => l.showId !== show.id),
      shows: current.shows.filter((s) => s.showId !== show.id),
    };
  } else {
    current = {
      ...current,
      shows: [
        {
          showId: show.id,
          name: show.name,
          author: show.author,
          artwork: show.artwork,
          bookmarkedAt: Date.now(),
        },
        ...current.shows,
      ],
    };
  }
  publish();
  await persist();
}

function useBookmarks(): Bookmarks {
  const [state, setState] = useState(current);
  useEffect(() => {
    listeners.add(setState);
    if (isLoaded) {
      setState((prev) => (prev === current ? prev : current));
    } else {
      load();
    }
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

export function usePodcastEpisodeLikes(): PodcastEpisodeLike[] {
  return useBookmarks().episodes;
}

export function usePodcastShowBookmarks(): PodcastShowBookmark[] {
  return useBookmarks().shows;
}
