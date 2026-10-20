import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import AddAlbumButton from "@/components/AddAlbumButton";
import { openInBrowser } from "@/scripts/openInBrowser";

jest.mock("@/scripts/openInBrowser", () => ({ openInBrowser: jest.fn() }));

// The bag opens the release's page on its host, the same for every host
describe("<AddAlbumButton />", () => {
  beforeEach(() => jest.clearAllMocks());

  const mirloRelease = {
    id: 5255,
    title: "Tales From the Fortress of Doom",
    source: "Mirlo Space",
    artistId: 1260,
    urlSlug: "tales-from-the-fortress-of-doom",
    artist: { id: 1260, name: "DOOMVEGA", urlSlug: "doomvega" },
  } as AlbumProps;

  test("opens a Mirlo release's page on Mirlo", () => {
    const { getByLabelText } = render(<AddAlbumButton trackGroup={mirloRelease} />);
    fireEvent.press(getByLabelText("Buy or download"));
    expect(openInBrowser).toHaveBeenCalledWith(
      "https://mirlo.space/doomvega/release/tales-from-the-fortress-of-doom",
    );
  });

  test("opens a Faircamp release's page on the artist's site", () => {
    const faircamp = {
      ...mirloRelease,
      source: "Faircamp",
      sourceUrl: "https://musica.laribal.org/comiat-de-benvinguda/",
    } as AlbumProps;
    const { getByLabelText } = render(<AddAlbumButton trackGroup={faircamp} />);
    fireEvent.press(getByLabelText("Buy or download"));
    expect(openInBrowser).toHaveBeenCalledWith("https://musica.laribal.org/comiat-de-benvinguda/");
  });

  test("shows nothing for a release with no page", () => {
    const local = { ...mirloRelease, source: "On this device", sourceUrl: undefined } as AlbumProps;
    expect(render(<AddAlbumButton trackGroup={local} />).toJSON()).toBeNull();
  });
});
