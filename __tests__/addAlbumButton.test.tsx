import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import AddAlbumButton from "@/components/AddAlbumButton";
import { openPurchase } from "@/scripts/openPurchase";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn() }),
}));

jest.mock("@/scripts/openPurchase", () => ({
  openPurchase: jest.fn(),
}));

describe("<AddAlbumButton />", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mirloAlbum: AlbumProps = {
    id: 102,
    title: "Paid Album",
    source: "Mirlo Space",
    minPrice: 500,
    artistId: 10,
    urlSlug: "paid-album",
    artist: { id: 10, name: "Artist", urlSlug: "artist-slug" },
    tracks: [{ id: 2, title: "Track 2" }],
  } as any;

  test("opens purchase modal for Mirlo albums", () => {
    const { getByRole } = render(<AddAlbumButton trackGroup={mirloAlbum} />);
    fireEvent.press(getByRole("button"));

    expect(openPurchase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "album",
        slug: "paid-album",
      }),
    );
  });

  test("renders nothing when Faircamp album has free download or no shop", () => {
    const freeFaircamp: AlbumProps = {
      ...mirloAlbum,
      source: "Faircamp",
      faircampShop: { mode: "free", downloadsUrl: "https://example.com/dl" },
    } as any;
    const { toJSON } = render(<AddAlbumButton trackGroup={freeFaircamp} />);
    expect(toJSON()).toBeNull();
  });
});
