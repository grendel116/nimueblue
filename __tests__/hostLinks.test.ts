import { mirloSupportUrl, releasePageUrl, releaseSupportUrl } from "@/scripts/hostLinks";

// Every host sells and takes support on its own pages; these are their addresses
describe("host pages", () => {
  const mirlo = {
    source: "Mirlo Space",
    urlSlug: "fawm-2026",
    artistId: 765,
    artist: { id: 765, urlSlug: "oji" },
  };
  const faircamp = {
    source: "Faircamp",
    sourceUrl: "https://musica.laribal.org/comiat-de-benvinguda/",
    urlSlug: "fairplayer-comiat-de-benvinguda%40musica.laribal.org",
  };

  test("a Mirlo release's purchase and support links point to the release page", () => {
    expect(releasePageUrl(mirlo)).toBe("https://mirlo.space/oji/release/fawm-2026");
    expect(releaseSupportUrl(mirlo)).toBe("https://mirlo.space/oji/release/fawm-2026");
  });

  test("Mirlo falls back to the artist's id when there's no slug", () => {
    const bySlugless = { ...mirlo, artist: { id: 765 } };
    expect(releasePageUrl(bySlugless)).toBe("https://mirlo.space/765/release/fawm-2026");
    expect(releaseSupportUrl(bySlugless)).toBe("https://mirlo.space/765/release/fawm-2026");
  });

  test("tracks Mirlo serves without naming a source are Mirlo's", () => {
    expect(releaseSupportUrl({ ...mirlo, source: undefined })).toBe(
      "https://mirlo.space/oji/release/fawm-2026",
    );
  });

  test("a Faircamp release's purchase and support links point to the release page", () => {
    expect(releasePageUrl(faircamp)).toBe("https://musica.laribal.org/comiat-de-benvinguda/");
    expect(releaseSupportUrl(faircamp)).toBe("https://musica.laribal.org/comiat-de-benvinguda/");
  });

  test("a catalogue under a folder keeps its release page URL", () => {
    const nested = { source: "Faircamp", sourceUrl: "https://sockpuppet.band/sjx/the-war-machine/" };
    expect(releaseSupportUrl(nested)).toBe("https://sockpuppet.band/sjx/the-war-machine/");
  });

  test("releases with no page offer none", () => {
    expect(releasePageUrl({ source: "On this device" })).toBeUndefined();
    expect(releaseSupportUrl({ source: "On this device" })).toBeUndefined();
  });

  test("support pages for Mirlo artists", () => {
    expect(mirloSupportUrl("doomvega")).toBe("https://mirlo.space/doomvega");
  });
});
