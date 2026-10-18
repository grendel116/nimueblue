jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import {
  isPodcastShowBookmarked,
  togglePodcastEpisodeLike,
  togglePodcastShowBookmark,
} from "@/scripts/podcastLikes";
import { downloadedAlbumMatcher, DownloadedTrack } from "@/scripts/downloadManager";
import AsyncStorage from "@react-native-async-storage/async-storage";

const show = { id: "upstream", name: "Upstream Podcast", author: "Cooperative Business", artwork: "a.jpg" };
const episode = (id: string) => ({
  podcastEpisodeId: id,
  podcastId: show.id,
  title: `Episode ${id}`,
  artist: show.author,
  url: `https://example.com/${id}.mp3`,
  trackGroup: { title: show.name },
});

const saved = async () => ({
  episodes: JSON.parse((await AsyncStorage.getItem("mirlo_blue_podcast_episode_likes_v1")) || "[]"),
  shows: JSON.parse((await AsyncStorage.getItem("mirlo_blue_podcast_show_bookmarks_v1")) || "[]"),
});

describe("podcast bookmarks", () => {
  test("bookmarking an episode bookmarks its show, and the last episode removes it", async () => {
    await togglePodcastEpisodeLike(episode("a"));
    await togglePodcastEpisodeLike(episode("b"));
    let state = await saved();
    expect(state.shows.map((s: any) => s.showId)).toEqual([show.id]);

    await togglePodcastEpisodeLike(episode("a"));
    state = await saved();
    expect(state.shows).toHaveLength(1);

    await togglePodcastEpisodeLike(episode("b"));
    state = await saved();
    expect(state.episodes).toHaveLength(0);
    expect(state.shows).toHaveLength(0);
  });

  test("the show bookmark toggles on its own and clears its episodes when removed", async () => {
    await togglePodcastShowBookmark(show);
    expect(isPodcastShowBookmarked(show.id)).toBe(true);

    await togglePodcastEpisodeLike(episode("c"));
    await togglePodcastShowBookmark(show);
    const state = await saved();
    expect(state.shows).toHaveLength(0);
    expect(state.episodes).toHaveLength(0);
    expect(isPodcastShowBookmarked(show.id)).toBe(false);
  });
});

describe("downloadedAlbumMatcher", () => {
  const download = (albumTitle: string, artist: string): DownloadedTrack => ({
    id: -1,
    title: "Song",
    artist,
    albumTitle,
    url: "file:///music/song.mp3",
    downloadedAt: 1,
    source: "file",
  });

  test("finds an album saved on the device by title and artist", () => {
    const onDevice = downloadedAlbumMatcher([download("Bought & Saved!", "Duo")]);
    expect(onDevice({ title: "bought & saved", artist: { name: "Duo" } })).toBe(true);
    expect(onDevice({ title: "Another Album", artist: { name: "Duo" } })).toBe(false);
  });
});
