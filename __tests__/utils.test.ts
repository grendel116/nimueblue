import {
  audioTrackType,
  isTrackOwned,
  isTrackOwnedOrPreview,
  resolveArtworkUrl,
  isQualityArtwork,
  resolveQualityArtworkSource,
  htmlToMarkdown,
  decodeHtmlEntities,
} from "@/scripts/utils";
import { createMockUser } from "@/__mocks__/mockUser";
import { createMockRNTrack } from "@/__mocks__/mockRNTrack";

describe("resolveArtworkUrl", () => {
  test("returns empty string for undefined or empty input", () => {
    expect(resolveArtworkUrl(undefined)).toBe("");
    expect(resolveArtworkUrl("")).toBe("");
    expect(resolveArtworkUrl("   ")).toBe("");
  });

  test("preserves absolute HTTP, HTTPS, and file URLs", () => {
    expect(resolveArtworkUrl("https://example.com/cover.jpg")).toBe("https://example.com/cover.jpg");
    expect(resolveArtworkUrl("http://example.com/cover.jpg")).toBe("http://example.com/cover.jpg");
    expect(resolveArtworkUrl("file:///data/cover.jpg")).toBe("file:///data/cover.jpg");
    expect(resolveArtworkUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });

  test("prefixes relative URLs with API_ROOT", () => {
    const result = resolveArtworkUrl("/media/covers/album.jpg");
    expect(result).toMatch(/\/media\/covers\/album\.jpg$/);
    expect(result.startsWith("http")).toBe(true);
  });
});

describe("isQualityArtwork", () => {
  test("rejects undefined, empty, or non-string inputs", () => {
    expect(isQualityArtwork(undefined)).toBe(false);
    expect(isQualityArtwork("")).toBe(false);
    expect(isQualityArtwork("   ")).toBe(false);
    // @ts-expect-error test non-string
    expect(isQualityArtwork(null)).toBe(false);
    // @ts-expect-error test non-string
    expect(isQualityArtwork(12345)).toBe(false);
  });

  test("rejects invalid schemes", () => {
    expect(isQualityArtwork("javascript:alert(1)")).toBe(false);
    expect(isQualityArtwork("ftp://example.com/art.png")).toBe(false);
    expect(isQualityArtwork("relative/path/art.png")).toBe(false);
  });

  test("rejects desktop .ico and favicon URLs", () => {
    expect(isQualityArtwork("https://example.com/favicon.ico")).toBe(false);
    expect(isQualityArtwork("https://example.com/favicon.ico?v=2")).toBe(false);
    expect(isQualityArtwork("http://radio.org/assets/logo.ico")).toBe(false);
  });

  test("rejects tiny thumbnails (16px and 32px indicators)", () => {
    expect(isQualityArtwork("https://example.com/thumb_16x16.png")).toBe(false);
    expect(isQualityArtwork("https://example.com/icon_32x32.jpg")).toBe(false);
    expect(isQualityArtwork("https://example.com/cover.png?size=16")).toBe(false);
    expect(isQualityArtwork("https://example.com/cover.png?w=32&h=32")).toBe(false);
    expect(isQualityArtwork("https://example.com/cover.png?width=16")).toBe(false);
  });

  test("accepts valid high-resolution artwork URLs", () => {
    expect(isQualityArtwork("https://example.com/cover.jpg")).toBe(true);
    expect(isQualityArtwork("https://example.com/artwork_600x600.png")).toBe(true);
    expect(isQualityArtwork("http://wfmu.org/images/wfmu_logo.png")).toBe(true);
    expect(isQualityArtwork("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA")).toBe(true);
    expect(isQualityArtwork("file:///local/storage/cover.jpg")).toBe(true);
  });
});

describe("resolveQualityArtworkSource", () => {
  test("returns no image source when artwork is missing or low quality", () => {
    expect(resolveQualityArtworkSource(undefined)).toBeUndefined();
    expect(resolveQualityArtworkSource("")).toBeUndefined();
    expect(resolveQualityArtworkSource("https://example.com/favicon.ico")).toBeUndefined();
    expect(resolveQualityArtworkSource("https://example.com/thumb_16x16.png")).toBeUndefined();
  });

  test("returns URI source object when artwork meets quality standards", () => {
    expect(resolveQualityArtworkSource("https://example.com/album_art.jpg")).toEqual({
      uri: "https://example.com/album_art.jpg",
    });
  });
});

describe("audioTrackType", () => {
  test("returns 'hls' for .m3u8 URLs", () => {
    expect(audioTrackType("/v1/tracks/123/stream/playlist.m3u8")).toBe("hls");
    expect(audioTrackType("https://api.mirlo.space/v1/tracks/1/x.m3u8")).toBe(
      "hls",
    );
  });

  test("returns 'dash' for .mpd URLs", () => {
    expect(audioTrackType("https://example.com/manifest.mpd")).toBe("dash");
  });

  test("returns 'default' for everything else", () => {
    expect(audioTrackType("https://example.com/track.mp3")).toBe("default");
    expect(audioTrackType("https://example.com/track.flac")).toBe("default");
    expect(audioTrackType("file:///local/path.wav")).toBe("default");
    expect(audioTrackType("")).toBe("default");
  });

  test("is case-sensitive on the extension (matches what the server actually sends)", () => {
    // server sends lowercase; uppercase shouldn't trigger HLS
    expect(audioTrackType("https://example.com/PLAYLIST.M3U8")).toBe("default");
  });
});

describe("isTrackOwned", () => {
  test("returns false when user is not logged in", () => {
    const track = createMockRNTrack();
    expect(isTrackOwned(track, undefined, null)).toBe(false);
    expect(isTrackOwned(track, undefined, undefined)).toBe(false);
  });

  test("returns true when user owns the track group (artist match)", () => {
    const user = createMockUser({ id: 42 });
    const track = createMockRNTrack({
      trackGroup: {
        ...createMockRNTrack().trackGroup,
        artistId: 42,
      },
    });
    expect(isTrackOwned(track, undefined, user)).toBe(true);
  });

  test("returns true when user has purchased the track group", () => {
    const user = createMockUser({ id: 7 });
    const track = createMockRNTrack({
      trackGroup: {
        ...createMockRNTrack().trackGroup,
        artistId: 999,
        userTrackGroupPurchases: [{ userId: 7 }],
      },
    });
    expect(isTrackOwned(track, undefined, user)).toBe(true);
  });

  test("returns true when user has purchased the track group in user.userTrackGroupPurchases", () => {
    const user = createMockUser({
      id: 7,
      userTrackGroupPurchases: [{ trackGroupId: 55 }],
    });
    const track = createMockRNTrack({
      trackGroupId: 55,
      trackGroup: {
        ...createMockRNTrack().trackGroup,
        id: 55,
        artistId: 999,
        userTrackGroupPurchases: [],
      },
    });
    expect(isTrackOwned(track, undefined, user)).toBe(true);
  });

  test("returns true when user has individual track purchase in user.userTrackPurchases", () => {
    const user = createMockUser({
      id: 7,
      userTrackPurchases: [{ trackId: 888 }],
    });
    const track = createMockRNTrack({
      id: 888,
      trackGroup: {
        ...createMockRNTrack().trackGroup,
        artistId: 999,
        userTrackGroupPurchases: [],
      },
    });
    expect(isTrackOwned(track, undefined, user)).toBe(true);
  });

  test("returns false when user neither owns nor purchased", () => {
    const user = createMockUser({ id: 1 });
    const track = createMockRNTrack({
      trackGroup: {
        ...createMockRNTrack().trackGroup,
        artistId: 999,
        userTrackGroupPurchases: [{ userId: 2 }, { userId: 3 }],
      },
    });
    expect(isTrackOwned(track, undefined, user)).toBe(false);
  });

  test("returns false on null track", () => {
    const user = createMockUser();
    // @ts-expect-error - validating defensive check
    expect(isTrackOwned(null, undefined, user)).toBe(false);
  });
});

describe("isTrackOwnedOrPreview", () => {
  test("returns true for any preview track (regardless of user state)", () => {
    const track = createMockRNTrack({ isPreview: true });
    expect(isTrackOwnedOrPreview(track)).toBe(true);
    expect(isTrackOwnedOrPreview(track, undefined)).toBe(true);
    expect(isTrackOwnedOrPreview(track, null)).toBe(true);
    expect(isTrackOwnedOrPreview(track, createMockUser())).toBe(true);
  });

  test("non-preview unreleased track is never playable", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const track = createMockRNTrack({ isPreview: false });
    const trackGroup = {
      ...track.trackGroup,
      releaseDate: future,
    };
    const user = createMockUser({ id: trackGroup.artistId });
    expect(isTrackOwnedOrPreview(track, user, trackGroup)).toBe(false);
  });

  test("non-preview released track is playable when user owns it", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const track = createMockRNTrack({ isPreview: false });
    const trackGroup = {
      ...track.trackGroup,
      releaseDate: past,
      artistId: 42,
    };
    const user = createMockUser({ id: 42 });
    expect(isTrackOwnedOrPreview(track, user, trackGroup)).toBe(true);
  });

  test("non-preview released track is NOT playable for an anonymous user", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const track = createMockRNTrack({ isPreview: false });
    const trackGroup = {
      ...track.trackGroup,
      releaseDate: past,
    };
    expect(isTrackOwnedOrPreview(track, null, trackGroup)).toBe(false);
  });
});

describe("htmlToMarkdown", () => {
  test("returns empty string for undefined or falsy input", () => {
    expect(htmlToMarkdown(undefined)).toBe("");
    expect(htmlToMarkdown("")).toBe("");
  });

  test("returns plain text unchanged if no HTML or entities present", () => {
    expect(htmlToMarkdown("Simple album description")).toBe("Simple album description");
  });

  test("converts paragraphs and line breaks to markdown newlines", () => {
    const html = "<p>First paragraph.</p><p>Second paragraph with<br/>a line break.</p>";
    expect(htmlToMarkdown(html).trim()).toBe("First paragraph.\n\nSecond paragraph with\na line break.");
  });

  test("converts HTML anchors to markdown links", () => {
    const html = '<p>Check out our <a href="https://mirlo.space/artist">Mirlo page</a> for more.</p>';
    expect(htmlToMarkdown(html).trim()).toBe("Check out our [Mirlo page](https://mirlo.space/artist) for more.");
  });

  test("converts bold and italic markup", () => {
    const html = "<p><strong>Bold</strong> text and <i>italic</i> notes.</p>";
    expect(htmlToMarkdown(html).trim()).toBe("**Bold** text and *italic* notes.");
  });

  test("converts HTML character entities to clean text", () => {
    const html = "It&rsquo;s &ldquo;Sockpuppet&rdquo; &amp; friends &mdash; enjoy!";
    expect(htmlToMarkdown(html)).toBe("It's \"Sockpuppet\" & friends — enjoy!");
  });
});

describe("decodeHtmlEntities", () => {
  test("decodes hexadecimal entities including apostrophes and quotes", () => {
    expect(decodeHtmlEntities("Salms d&#x27;obediència lluciferi")).toBe("Salms d'obediència lluciferi");
    expect(decodeHtmlEntities("Say &#x22;Hello&#x22;")).toBe('Say "Hello"');
    expect(decodeHtmlEntities("Rock &#x26; Roll")).toBe("Rock & Roll");
    expect(decodeHtmlEntities("Upper &#X27; case")).toBe("Upper ' case");
  });

  test("decodes decimal entities", () => {
    expect(decodeHtmlEntities("It&#39;s an &#8217;apostrophe&#8217;")).toBe("It's an 'apostrophe'");
    expect(decodeHtmlEntities("Price: &#36;100")).toBe("Price: $100");
    expect(decodeHtmlEntities("Leading zeroes: &#039;")).toBe("Leading zeroes: '");
  });

  test("decodes legacy Windows-1252 numeric entities", () => {
    expect(decodeHtmlEntities("It&#146;s &#147;great&#148;")).toBe('It\'s "great"');
    expect(decodeHtmlEntities("Wait&#133; &#150; more")).toBe("Wait… – more");
  });

  test("decodes standard XML and named entities", () => {
    expect(decodeHtmlEntities("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(decodeHtmlEntities("&quot;Mirlo&quot; &lt;band&gt;")).toBe('"Mirlo" <band>');
    expect(decodeHtmlEntities("&apos;single&apos;")).toBe("'single'");
    expect(decodeHtmlEntities("caf&eacute; &amp; cr&egrave;me")).toBe("café & crème");
    expect(decodeHtmlEntities("Se&ntilde;or &ccedil;a va")).toBe("Señor ça va");
  });

  test("leaves text without entities unchanged", () => {
    expect(decodeHtmlEntities("Plain Track Title")).toBe("Plain Track Title");
    expect(decodeHtmlEntities(undefined)).toBe("");
    expect(decodeHtmlEntities("")).toBe("");
  });
});
