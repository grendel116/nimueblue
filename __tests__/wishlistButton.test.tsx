jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import WishlistButton from "@/components/WishlistButton";
import FavoriteTrackButton from "@/components/FavoriteTrackButton";

describe("<WishlistButton /> & <FavoriteTrackButton /> (local saves)", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  test("liking an album saves it and its displayed tracks locally without login", async () => {
    const rawTrackGroup = {
      id: 10,
      urlSlug: "album-10",
      title: "Album 10",
      tracks: [
        { id: 101, title: "Displayed 1", url: "https://example.com/101.mp3" } as any,
        { id: 102, title: "Displayed 2", url: "https://example.com/102.mp3" } as any,
        { id: 999, title: "Invisible Track", url: "https://example.com/999.mp3" } as any,
      ],
    };

    const displayedTracks = [
      { id: 101, title: "Displayed 1", url: "https://example.com/101.mp3" } as any,
      { id: 102, title: "Displayed 2", url: "https://example.com/102.mp3" } as any,
    ];

    const { getByRole } = render(
      <WishlistButton
        trackGroup={rawTrackGroup}
        displayedTracks={displayedTracks}
      />,
    );

    fireEvent.press(getByRole("button"));

    await waitFor(async () => {
      const stored = JSON.parse(
        (await AsyncStorage.getItem("mirlo_blue_faircamp_saves_v1")) || "{}",
      );
      expect(stored.albums).toHaveLength(1);
      expect(stored.albums[0].album.id).toBe(10);
      expect(stored.tracks.map((t: any) => t.track.id)).toEqual([101, 102]);
    });

    // Pressing again removes the album and its tracks from local saves
    fireEvent.press(getByRole("button"));

    await waitFor(async () => {
      const stored = JSON.parse(
        (await AsyncStorage.getItem("mirlo_blue_faircamp_saves_v1")) || "{}",
      );
      expect(stored.albums).toHaveLength(0);
      expect(stored.tracks).toHaveLength(0);
    });
  });

  test("liking any track via FavoriteTrackButton adds its album to the local wishlist, and unliking the last track removes it", async () => {
    const album = {
      id: 10,
      title: "Album 10",
      urlSlug: "album-10",
    };
    const track1 = {
      id: 101,
      title: "Track 1",
      url: "https://example.com/101.mp3",
      trackGroupId: 10,
      trackGroup: album,
    } as any;
    const track2 = {
      id: 102,
      title: "Track 2",
      url: "https://example.com/102.mp3",
      trackGroupId: 10,
      trackGroup: album,
    } as any;

    const r1 = render(<FavoriteTrackButton track={track1} />);
    fireEvent.press(r1.getByRole("button"));

    await waitFor(async () => {
      const stored = JSON.parse(
        (await AsyncStorage.getItem("mirlo_blue_faircamp_saves_v1")) || "{}",
      );
      expect(stored.albums).toHaveLength(1);
      expect(stored.tracks).toHaveLength(1);
    });
    r1.unmount();

    const r2 = render(<FavoriteTrackButton track={track2} />);
    fireEvent.press(r2.getByRole("button"));

    await waitFor(async () => {
      const stored = JSON.parse(
        (await AsyncStorage.getItem("mirlo_blue_faircamp_saves_v1")) || "{}",
      );
      expect(stored.albums).toHaveLength(1);
      expect(stored.tracks).toHaveLength(2);
    });
    r2.unmount();

    // Unlike first track: album stays in wishlist
    const r3 = render(<FavoriteTrackButton track={track1} />);
    fireEvent.press(r3.getByRole("button"));
    await waitFor(async () => {
      const stored = JSON.parse(
        (await AsyncStorage.getItem("mirlo_blue_faircamp_saves_v1")) || "{}",
      );
      expect(stored.albums).toHaveLength(1);
      expect(stored.tracks).toHaveLength(1);
    });
    r3.unmount();

    // Unlike second track: album is removed from wishlist
    const r4 = render(<FavoriteTrackButton track={track2} />);
    fireEvent.press(r4.getByRole("button"));
    await waitFor(async () => {
      const stored = JSON.parse(
        (await AsyncStorage.getItem("mirlo_blue_faircamp_saves_v1")) || "{}",
      );
      expect(stored.albums).toHaveLength(0);
      expect(stored.tracks).toHaveLength(0);
    });
  });
});
