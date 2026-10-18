jest.mock("@preeternal/react-native-cookie-manager", () => ({
  __esModule: true,
  default: { get: jest.fn(), getAll: jest.fn(), clearAll: jest.fn() },
}));

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { CAROUSEL_LIMIT, blendCarouselReleases } from "@/scripts/carousel";

describe("carousel limits and blending", () => {
  test("CAROUSEL_LIMIT is 12", () => {
    expect(CAROUSEL_LIMIT).toBe(12);
  });

  test("blendCarouselReleases caps returned releases to CAROUSEL_LIMIT (12) by default", () => {
    const makeAlbum = (id: number, artist: string, slug?: string): AlbumProps => ({
      id,
      title: `Album ${id}`,
      urlSlug: slug ?? `album-${id}`,
      artistId: id,
      artist: { id, name: artist, urlSlug: `artist-${id}` },
    } as unknown as AlbumProps);

    const direct = Array.from({ length: 20 }, (_, i) => makeAlbum(i + 1, `Direct Artist ${i + 1}`));
    const chorus = Array.from({ length: 20 }, (_, i) => makeAlbum(i + 21, `Chorus Artist ${i + 1}`));
    const fairplayer = Array.from({ length: 20 }, (_, i) => makeAlbum(i + 41, `Fairplayer Artist ${i + 1}`));

    const blended = blendCarouselReleases(direct, chorus, fairplayer);
    expect(blended.length).toBe(12);
  });

  test("blendCarouselReleases respects custom limit when provided", () => {
    const makeAlbum = (id: number, artist: string): AlbumProps => ({
      id,
      title: `Album ${id}`,
      urlSlug: `album-${id}`,
      artistId: id,
      artist: { id, name: artist, urlSlug: `artist-${id}` },
    } as unknown as AlbumProps);

    const direct = Array.from({ length: 15 }, (_, i) => makeAlbum(i + 1, `Artist ${i + 1}`));
    const blended = blendCarouselReleases(direct, [], [], 5);
    expect(blended.length).toBe(5);
  });

  test("blendCarouselReleases returns all items if fewer than CAROUSEL_LIMIT", () => {
    const makeAlbum = (id: number, artist: string): AlbumProps => ({
      id,
      title: `Album ${id}`,
      urlSlug: `album-${id}`,
      artistId: id,
      artist: { id, name: artist, urlSlug: `artist-${id}` },
    } as unknown as AlbumProps);

    const direct = [makeAlbum(1, "Artist 1"), makeAlbum(2, "Artist 2")];
    const blended = blendCarouselReleases(direct, [], []);
    expect(blended.length).toBe(2);
  });
});
