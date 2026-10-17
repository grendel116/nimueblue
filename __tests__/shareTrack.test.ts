jest.mock("@preeternal/react-native-cookie-manager", () => ({
  __esModule: true,
  default: { get: jest.fn(), getAll: jest.fn(), clearAll: jest.fn() },
}));

import {
  buildShareMessage,
  buildShareUrl,
  resolveTrackSourceUrl,
} from "@/components/ShareTrackButton";

describe("ShareTrackButton clean short routes", () => {
  test("builds short /t/:id URL and share message for standard Mirlo track", () => {
    const track = {
      id: 42,
      title: "Solidarity Forever",
      artist: "Utah Phillips",
      artwork: "https://cdn.mirlo.space/cover.jpg",
      url: "https://mirlo.space/stream/42.mp3",
      trackGroup: {
        id: 10,
        title: "We Have Fed You All",
        urlSlug: "we-have-fed-you-all",
        artist: {
          id: 5,
          name: "Utah Phillips",
          urlSlug: "utah-phillips",
        },
      },
    } as any;

    const sourceUrl = resolveTrackSourceUrl(track);
    expect(sourceUrl).toBe(
      "https://mirlo.space/utah-phillips/release/we-have-fed-you-all/tracks/42",
    );

    const shareUrl = buildShareUrl(track);
    expect(shareUrl).toBe("https://nimueblue-share.nimueblue.workers.dev/t/42");

    const { fullText, headline } = buildShareMessage(track);
    expect(headline).toBe("Utah Phillips - Solidarity Forever");
    expect(fullText).toBe("https://nimueblue-share.nimueblue.workers.dev/t/42");
  });

  test("builds the same short track route style for Faircamp tracks", () => {
    const shareUrl = buildShareUrl({
      id: 8153,
      title: "La del cowboy",
      artist: "Calaix desastre",
      artwork: "https://images.example/cover.jpg",
      url: "https://calaixdesastre.online/track.opus",
      order: 2,
      source: "Faircamp",
      trackGroup: {
        urlSlug: "fairplayer-primer-calaix%40calaixdesastre.online",
      },
    } as any);

    expect(shareUrl).toBe(
      "https://nimueblue-share.nimueblue.workers.dev/t/f8153",
    );
  });

  test("keeps Faircamp tracks with generated IDs on compact short routes", () => {
    const shareUrl = buildShareUrl({
      id: 14582523,
      title: "Untitled song",
      artist: "Sockpuppet",
      source: "Faircamp",
      fairplayerTrackId: "primer-calaix@sockpuppet.band#2",
      trackGroup: {
        urlSlug: "fairplayer-primer-calaix%40sockpuppet.band",
      },
    } as any);

    expect(shareUrl).toBe(
      "https://nimueblue-share.nimueblue.workers.dev/t/fprimer-calaix%40sockpuppet.band%232",
    );
  });

  test("builds short /r/:station URL for live radio station", () => {
    const track = {
      id: -100,
      title: "WFMU",
      artist: "Live from Jersey City",
      artwork: "https://wfmu.org/logo.jpg",
      liveStation: "wfmu",
    } as any;

    const shareUrl = buildShareUrl(track);
    const url = new URL(shareUrl);
    expect(url.pathname).toBe("/r/wfmu");
    expect(url.search).toBe("");

    const { headline, fullText } = buildShareMessage(track, "Ambient Noon", "DJ Yuka");
    expect(headline).toBe("DJ Yuka - Ambient Noon");
    const messageUrl = new URL(fullText);
    expect(messageUrl.pathname).toBe("/r/wfmu");
    expect(messageUrl.search).toBe("");
  });

  test("builds short /r/:station URL when no on-air song is parsed", () => {
    const track = {
      id: -101,
      title: "Resonance 104.4 FM",
      artist: "Live from London",
      artwork: "https://resonancefm.com/logo.png",
      liveStation: "resonance-fm",
    } as any;

    const shareUrl = buildShareUrl(track);
    const url = new URL(shareUrl);
    expect(url.pathname).toBe("/r/resonance-fm");
    expect(url.search).toBe("");

    const { headline, fullText } = buildShareMessage(track);
    expect(headline).toBe("Resonance 104.4 FM");
    expect(new URL(fullText).search).toBe("");
  });

  test("builds short /p/:podcast URL for podcast episode", () => {
    const track = {
      id: -200,
      title: "Library Socialism 101",
      artist: "Shawn Vulliez & Aaron Moritz",
      artwork: "https://srslywrong.com/art.jpg",
      url: "https://traffic.libsyn.com/srslywrong/episode101.mp3",
      podcastId: "srsly-wrong",
    } as any;

    const shareUrl = buildShareUrl(track);
    expect(shareUrl).toBe("https://nimueblue-share.nimueblue.workers.dev/p/srsly-wrong");

    const { headline, fullText } = buildShareMessage(track);
    expect(headline).toBe("Shawn Vulliez & Aaron Moritz - Library Socialism 101");
    expect(fullText).toBe(shareUrl);
  });

  test("supports dynamic Chorus radio station short URLs", () => {
    const track = {
      id: -300,
      title: "Autonomous Soundscapes",
      artist: "Chorus Radio",
      artwork: "https://chorus.fm/covers/1234.webp",
      url: "https://chorus.fm/stream.m3u8",
      liveStation: "chorus-radio-1234",
    } as any;

    const shareUrl = buildShareUrl(track);
    const url = new URL(shareUrl);
    expect(url.pathname).toBe("/r/chorus-radio-1234");
    expect(url.search).toBe("");
  });

  test("keeps discovered radio and podcast routes short", () => {
    const discoveredRadio = buildShareUrl({
      id: -301,
      title: "Achala Radio",
      artist: "Live from Córdoba",
      artwork: "https://example.com/achala.png",
      url: "https://radio.example.com/live.mp3",
      liveStation: "rb-12345678123412341234123412341234",
    } as any);
    const radioUrl = new URL(discoveredRadio);
    expect(radioUrl.pathname).toBe("/r/rb-12345678123412341234123412341234");
    expect(radioUrl.search).toBe("");

    const discoveredPodcast = buildShareUrl({
      id: -302,
      title: "A Current Episode",
      artist: "Independent Host",
      artwork: "https://example.com/discovered-show.png",
      url: "https://feeds.example.com/episode.mp3",
      podcastId: "pod-123456",
      sourceUrl: "https://podcasts.example.com/show",
    } as any);
    const podcastUrl = new URL(discoveredPodcast);
    expect(podcastUrl.pathname).toBe("/p/pod-123456");
    expect(podcastUrl.search).toBe("");
  });

  test("falls back cleanly when no artist is present", () => {
    const track = {
      id: 99,
      title: "Untitled Demo",
      artist: "",
    } as any;

    const shareUrl = buildShareUrl(track);
    expect(shareUrl).toBe("https://nimueblue-share.nimueblue.workers.dev/t/99");

    const { headline, fullText } = buildShareMessage(track);
    expect(headline).toBe("Untitled Demo");
    expect(fullText).toBe("https://nimueblue-share.nimueblue.workers.dev/t/99");
  });
});
