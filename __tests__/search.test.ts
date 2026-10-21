jest.mock("react-native-track-player", () => require("../shims/react-native-track-player.web"));

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import {
  scoreSearchResult,
  sortResultsByAccuracy,
  getFieldMatchStrength,
  Result,
} from "@/state/SearchContext";
import {
  GENRE_CATALOG,
  findGenreByTag,
  matchGenres,
  getGenreExpansionTags,
} from "@/constants/genres";
import SearchItem, { constructUrl } from "@/components/SearchItem";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockNavigate = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    navigate: mockNavigate,
    canGoBack: () => true,
  }),
}));

jest.mock("@/state/PlayerContext", () => ({
  usePlayer: () => ({
    activeTrack: null,
    isPlaying: false,
    playTrack: jest.fn(),
    togglePlayPause: jest.fn(),
    addToQueue: jest.fn(),
  }),
}));

describe("Search Accuracy Ranking (track name > artist name > genre > tag)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("ranks exact > prefix > word > substring within a field", () => {
    const exact = getFieldMatchStrength("ambient", "ambient", ["ambient"]);
    const prefix = getFieldMatchStrength("ambient Odyssey", "ambient", ["ambient"]);
    const word = getFieldMatchStrength("Deep Ambient Waves", "ambient", ["ambient"]);
    const substring = getFieldMatchStrength("subambient", "ambient", ["ambient"]);

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(0);
  });

  test("strictly orders results by Track Name > Artist Name > Genre > Tag", () => {
    const tagMatchedAlbum: Result = {
      id: "alb-tag",
      name: "Midnight Horizon",
      artistName: "Nova",
      category: "Album",
      isTrackGroup: true,
      matchedTag: "disco-house",
      tags: ["disco-house"],
    };

    const tagPill: Result = {
      id: "tag-disco",
      name: "#disco",
      tagSlug: "disco",
      category: "Tag",
      isTag: true,
      matchedTag: "disco",
    };

    const genreCard: Result = {
      id: "genre-synth",
      name: "Synth & Wave",
      subtitle: "Synthwave, Darkwave, Disco & Coldwave",
      tagSlug: "synthwave",
      category: "Genre",
      isGenre: true,
      matchedGenre: " disco ",
    };

    const artistMatchedTrack: Result = {
      id: "trk-artist",
      name: "Starlight",
      artistName: "Disco Tigers",
      category: "Track",
      isTrack: true,
    };

    const artistProfile: Result = {
      id: "art-1",
      name: "Disco",
      category: "Artist",
      isArtist: true,
    };

    const trackSubstring: Result = {
      id: "trk-sub",
      name: "Silent Discotheque",
      artistName: "Lunar",
      category: "Track",
      isTrack: true,
    };

    const trackExact: Result = {
      id: "trk-exact",
      name: "Disco",
      artistName: "Solar",
      category: "Track",
      isTrack: true,
    };

    const unsorted: Result[] = [
      tagMatchedAlbum,
      genreCard,
      artistMatchedTrack,
      tagPill,
      trackSubstring,
      artistProfile,
      trackExact,
    ];

    const sorted = sortResultsByAccuracy(unsorted, "disco");

    // 1. Track Name matches come first (exact track name before substring track name)
    expect(sorted[0].id).toBe("trk-exact");
    expect(sorted[1].id).toBe("trk-sub");

    // 2. Artist Name matches come second (exact artist before prefix artist track)
    expect(sorted[2].id).toBe("art-1");
    expect(sorted[3].id).toBe("trk-artist");

    // 3. Genre match comes third
    expect(sorted[4].id).toBe("genre-synth");

    // 4. Tag matches come fourth (exact #disco tag before prefix #disco-house album)
    expect(sorted[5].id).toBe("tag-disco");
    expect(sorted[6].id).toBe("alb-tag");
  });

  test("boosts multi-word track + artist queries to the top", () => {
    const targetTrack: Result = {
      id: 1,
      name: "Windowlicker",
      artistName: "Aphex Twin",
      category: "Track",
      isTrack: true,
    };
    const otherTrackByArtist: Result = {
      id: 2,
      name: "Avril 14th",
      artistName: "Aphex Twin",
      category: "Track",
      isTrack: true,
    };
    const artistItem: Result = {
      id: 3,
      name: "Aphex Twin",
      category: "Artist",
      isArtist: true,
    };

    const sorted = sortResultsByAccuracy(
      [otherTrackByArtist, artistItem, targetTrack],
      "aphex twin windowlicker",
    );

    expect(sorted[0].id).toBe(1);
    expect(scoreSearchResult(targetTrack, "aphex twin windowlicker")).toBeGreaterThan(
      scoreSearchResult(otherTrackByArtist, "aphex twin windowlicker"),
    );
  });
});

describe("Genre Catalog & Tag Expansion", () => {
  test("provides curated genre cards with tags and icons", () => {
    expect(GENRE_CATALOG.length).toBeGreaterThanOrEqual(10);
    for (const genre of GENRE_CATALOG) {
      expect(genre.id).toBeTruthy();
      expect(genre.name).toBeTruthy();
      expect(genre.primaryTag).toBeTruthy();
      expect(genre.tags.length).toBeGreaterThan(0);
    }
  });

  test("matches genres by name, sub-tag, or keyword", () => {
    const ambientMatches = matchGenres("drone");
    expect(ambientMatches.some((g) => g.id === "ambient")).toBe(true);

    const synthMatches = matchGenres("darkwave");
    expect(synthMatches.some((g) => g.id === "synth")).toBe(true);

    const found = findGenreByTag("#shoegaze");
    expect(found?.id).toBe("indie");
  });

  test("expands genre umbrella tags for plentiful tag page results", () => {
    const expanded = getGenreExpansionTags("ambient");
    expect(expanded).toContain("ambient");
    expect(expanded).toContain("drone");
    expect(expanded).toContain("soundscape");
  });
});

describe("Persistent Search Navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("constructs routes for tracks, genres, tags, albums, artists, radio, and podcasts", () => {
    expect(
      constructUrl({
        id: "g1",
        name: "Ambient & Drone",
        tagSlug: "ambient",
        isGenre: true,
      }),
    ).toBe("/tags/ambient");

    expect(
      constructUrl({
        id: "t1",
        name: "#post-punk",
        tagSlug: "post-punk",
        isTag: true,
      }),
    ).toBe("/tags/post-punk");

    expect(
      constructUrl({
        id: 42,
        name: "My Song",
        artistId: "sockpuppet",
        trackGroupId: "sjx",
        isTrack: true,
      }),
    ).toBe("/artist/sockpuppet/album/sjx/album-tracks");
  });

  test("pressing a search result pushes the destination onto the stack without dismissing search", () => {
    const item: Result = {
      id: 99,
      name: "Nightwing Theme",
      artistName: "Nimue",
      artistId: "nimue",
      trackGroupId: "blue-album",
      category: "Track",
      isTrack: true,
    };

    const { getByText } = render(React.createElement(SearchItem, { result: item, index: 0 }));
    fireEvent.press(getByText("Nightwing Theme"));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/artist/nimue/album/blue-album/album-tracks");
  });
});
