jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  isFaircampAlbumWishlisted,
  isFaircampArtistFollowed,
  isFaircampTrackLiked,
  toggleFaircampAlbumWishlist,
  toggleFaircampArtistFollow,
  toggleFaircampTrackLike,
} from "@/scripts/faircampSaves";

describe("device-only Faircamp saves", () => {
  test("persists track likes and album wishlists without Mirlo IDs", async () => {
    const album: AlbumProps = {
      id: 151801310,
      trackGroupId: 151801310,
      title: "sjX",
      urlSlug: "fairplayer-sjX%40sockpuppet.band",
      source: "Faircamp",
      cover: { sizes: { 60: "", 120: "", 300: "", 600: "", 960: "", 1200: "", 1500: "" } },
      artist: {
        id: 1,
        name: "Sockpuppet",
        bio: "",
        activityPub: false,
        userId: 1,
        enabled: true,
        createdAt: "",
        trackGroups: [],
      },
      artistId: 1,
      releaseDate: "",
      tracks: [],
    };
    const track: RNTrack = {
      id: 10483,
      trackGroupId: album.id,
      title: "The War Machine",
      artist: "Sockpuppet",
      url: "https://sockpuppet.band/sjx/01-war-machine.opus",
      source: "Faircamp",
      trackGroup: album,
      order: 1,
      queueIndex: 0,
      allowIndividualSale: false,
      isPreview: true,
      headers: {},
      audio: {
        url: "https://sockpuppet.band/sjx/01-war-machine.opus",
        duration: 252,
      },
    };
    const track2: RNTrack = {
      ...track,
      id: 10484,
      title: "Second Song",
      url: "https://sockpuppet.band/sjx/02-second-song.opus",
      order: 2,
      audio: {
        url: "https://sockpuppet.band/sjx/02-second-song.opus",
        duration: 180,
      },
    };
    album.tracks = [track, track2];

    // Liking any single track adds the whole album to the wishlist
    await toggleFaircampTrackLike(track);

    let stored = JSON.parse(
      (await AsyncStorage.getItem("mirlo_blue_faircamp_saves_v1")) || "{}",
    );
    expect(stored.tracks).toHaveLength(1);
    expect(stored.tracks[0].track.url).toBe(track.url);
    expect(stored.albums).toHaveLength(1);
    expect(stored.albums[0].album.urlSlug).toBe(album.urlSlug);

    // Unliking the only liked track removes the album from the wishlist
    await toggleFaircampTrackLike(track);
    stored = JSON.parse(
      (await AsyncStorage.getItem("mirlo_blue_faircamp_saves_v1")) || "{}",
    );
    expect(stored.tracks).toHaveLength(0);
    expect(stored.albums).toHaveLength(0);

    // Liking the big album heart likes all tracks and adds the album to the wishlist
    await toggleFaircampAlbumWishlist(album, [track, track2]);
    stored = JSON.parse(
      (await AsyncStorage.getItem("mirlo_blue_faircamp_saves_v1")) || "{}",
    );
    expect(stored.tracks).toHaveLength(2);
    expect(stored.albums).toHaveLength(1);

    // Unliking one track while another is still liked keeps the album in the wishlist
    await toggleFaircampTrackLike(track);
    stored = JSON.parse(
      (await AsyncStorage.getItem("mirlo_blue_faircamp_saves_v1")) || "{}",
    );
    expect(stored.tracks).toHaveLength(1);
    expect(stored.tracks[0].track.url).toBe(track2.url);
    expect(stored.albums).toHaveLength(1);

    // Toggling the big album heart off removes all remaining track likes and removes the album
    await toggleFaircampAlbumWishlist(album, [track, track2]);
    const removed = JSON.parse(
      (await AsyncStorage.getItem("mirlo_blue_faircamp_saves_v1")) || "{}",
    );
    expect(removed.tracks).toHaveLength(0);
    expect(removed.albums).toHaveLength(0);
  });

  test("persists Faircamp artist follows", async () => {
    const artist: Artist = {
      id: 42,
      name: "Sockpuppet",
      urlSlug: "fairplayer-artist-Sockpuppet",
      bio: "Faircamp catalog: https://sockpuppet.band",
      activityPub: false,
      userId: 0,
      enabled: true,
      createdAt: "",
      trackGroups: [],
      onMirlo: false,
    };

    await toggleFaircampArtistFollow(artist);

    let stored = JSON.parse(
      (await AsyncStorage.getItem("mirlo_blue_faircamp_saves_v1")) || "{}",
    );
    expect(isFaircampArtistFollowed(artist, stored)).toBe(true);
    expect(stored.artists).toHaveLength(1);
    expect(stored.artists[0].artist.name).toBe("Sockpuppet");

    await toggleFaircampArtistFollow(artist);

    stored = JSON.parse(
      (await AsyncStorage.getItem("mirlo_blue_faircamp_saves_v1")) || "{}",
    );
    expect(isFaircampArtistFollowed(artist, stored)).toBe(false);
    expect(stored.artists).toHaveLength(0);
  });

  test("persists and syncs likes between Now Playing (downloaded or streaming) and Album page", async () => {
    await AsyncStorage.clear();
    const album: AlbumProps = {
      id: 542,
      trackGroupId: 542,
      title: "Mama",
      urlSlug: "mama",
      source: "Mirlo Space",
      cover: { sizes: { 60: "", 120: "", 300: "", 600: "", 960: "", 1200: "", 1500: "" } },
      artist: {
        id: 88,
        name: "Iron Curtain",
        bio: "",
        activityPub: false,
        userId: 88,
        enabled: true,
        createdAt: "",
        trackGroups: [],
      },
      artistId: 88,
      releaseDate: "2026-01-01",
      tracks: [],
    };

    // Track on the Album page
    const albumTrack: RNTrack = {
      id: 10483,
      trackGroupId: album.id,
      title: "Mama",
      artist: "Iron Curtain",
      url: "https://mirlo.space/v1/tracks/10483/audio",
      source: "Mirlo Space",
      trackGroup: album,
      order: 1,
      queueIndex: 0,
      allowIndividualSale: true,
      isPreview: false,
      headers: {},
      audio: {
        url: "https://mirlo.space/v1/tracks/10483/audio",
        duration: 210,
      },
    };

    // Playing track on Now Playing (e.g. playing from local file download)
    const nowPlayingTrack: RNTrack = {
      ...albumTrack,
      url: "file:///data/user/0/space.mirlo.blue/files/tracks/10483.mp3",
    };

    // Liking on Now Playing
    await toggleFaircampTrackLike(nowPlayingTrack);

    // Both Now Playing and Album page track must reflect as liked
    expect(isFaircampTrackLiked(nowPlayingTrack)).toBe(true);
    expect(isFaircampTrackLiked(albumTrack)).toBe(true);

    // The album page must also reflect as wishlisted
    expect(isFaircampAlbumWishlisted(album)).toBe(true);

    // Unliking on Album page
    await toggleFaircampTrackLike(albumTrack);
    expect(isFaircampTrackLiked(nowPlayingTrack)).toBe(false);
    expect(isFaircampTrackLiked(albumTrack)).toBe(false);
    expect(isFaircampAlbumWishlisted(album)).toBe(false);
  });
});
