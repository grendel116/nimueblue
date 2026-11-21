import {
  decodeXml,
  parseDuration,
  parsePodcastChannelMeta,
  parsePodcastRss,
  findPodcastShow,
  fetchPodcastShowById,
  getCustomPodcastShows,
  episodeTrack,
  COLONIAL_OUTCASTS,
  PODCAST_SHOWS,
  PodcastEpisode,
  castopodPodcastToShow,
  fetchDiscoveredPodcasts,
  searchPodcastShows,
} from "@/queries/podcast";
import {
  isExcludedContent,
  loadMigratedCurationPreset,
  removeCustomPodcast,
  resetCurationConfig,
  setContentFilters,
  upsertCustomPodcast,
} from "@/queries/excludedContent";

describe("decodeXml", () => {
  test("strips CDATA blocks", () => {
    expect(decodeXml("<![CDATA[Episode 1: The Beginning]]>")).toBe("Episode 1: The Beginning");
  });

  test("decodes named and numeric XML entities", () => {
    expect(decodeXml("War &amp; Peace")).toBe("War & Peace");
    expect(decodeXml("It&#8217;s a &#8220;quote&#8221;")).toBe("It's a \"quote\"");
    expect(decodeXml("Price: &#36;100")).toBe("Price: $100");
    expect(decodeXml("Salms d&#x27;obedi&egrave;ncia")).toBe("Salms d'obediència");
  });

  test("handles empty or falsy strings", () => {
    expect(decodeXml("")).toBe("");
  });
});

describe("parseDuration", () => {
  test("parses HH:MM:SS format", () => {
    expect(parseDuration("01:30:15")).toBe(5415);
  });

  test("parses MM:SS format", () => {
    expect(parseDuration("45:30")).toBe(2730);
  });

  test("parses plain seconds format", () => {
    expect(parseDuration("3600")).toBe(3600);
  });

  test("returns undefined for invalid format", () => {
    expect(parseDuration(undefined)).toBeUndefined();
    expect(parseDuration("unknown")).toBeUndefined();
  });
});

describe("parsePodcastRss", () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Sample Podcast</title>
    <itunes:author>Host Name</itunes:author>
    <description>Independent audio stories</description>
    <link>https://example.com/show</link>
    <itunes:image href="https://example.com/cover.jpg" />
    <item>
      <title><![CDATA[Episode 2: Audio &amp; Story]]></title>
      <pubDate>Tue, 06 Oct 2026 18:00:00 GMT</pubDate>
      <guid>ep-2</guid>
      <description><![CDATA[<p>Summary of episode 2</p>]]></description>
      <enclosure url="https://example.com/ep2.mp3" type="audio/mpeg" length="12345" />
      <itunes:duration>01:15:00</itunes:duration>
      <itunes:image href="https://example.com/ep2.jpg" />
    </item>
    <item>
      <title>Episode 1: Non-Audio Announcement</title>
      <pubDate>Mon, 05 Oct 2026 18:00:00 GMT</pubDate>
      <guid>ep-1</guid>
      <description>Text announcement</description>
      <enclosure url="https://example.com/image.png" type="image/png" length="500" />
    </item>
    <item>
      <title>Episode 0: Launch</title>
      <pubDate>Sun, 04 Oct 2026 18:00:00 GMT</pubDate>
      <guid>ep-0</guid>
      <description>Launch episode</description>
      <enclosure url="https://example.com/ep0.m4a" type="audio/x-m4a" length="10000" />
      <itunes:duration>45:00</itunes:duration>
    </item>
  </channel>
</rss>`;

  test("extracts only audio episodes", () => {
    const episodes = parsePodcastRss(sampleXml);
    expect(episodes.length).toBe(2);
    expect(episodes[0].id).toBe("ep-2");
    expect(episodes[0].title).toBe("Episode 2: Audio & Story");
    expect(episodes[0].audioUrl).toBe("https://example.com/ep2.mp3");
    expect(episodes[0].duration).toBe(4500);
    expect(episodes[0].artwork).toBe("https://example.com/ep2.jpg");
    expect(episodes[0].description).toBe("Summary of episode 2");

    expect(episodes[1].id).toBe("ep-0");
    expect(episodes[1].title).toBe("Episode 0: Launch");
  });

  test("respects limit parameter", () => {
    const episodes = parsePodcastRss(sampleXml, 1);
    expect(episodes.length).toBe(1);
    expect(episodes[0].id).toBe("ep-2");
  });

  test("extracts channel metadata from RSS header", () => {
    const meta = parsePodcastChannelMeta(sampleXml, "https://example.com/feed.xml");
    expect(meta).toEqual({
      name: "Sample Podcast",
      author: "Host Name",
      description: "Independent audio stories",
      artwork: "https://example.com/cover.jpg",
      webUrl: "https://example.com/show",
      lastUpdated: "Tue, 06 Oct 2026 18:00:00 GMT",
    });
  });
});

describe("findPodcastShow", () => {
  beforeEach(() => {
    resetCurationConfig();
  });

  afterEach(() => {
    resetCurationConfig();
  });

  test("finds shows by ID and verifies migrated catalog contains ongoing shows", () => {
    expect(PODCAST_SHOWS.map((s) => s.id)).toEqual([
      "upstream",
      "working-class-history",
      "everything-coop",
      "native-roots-radio",
      "labor-history-today",
      "millennials-killing-capitalism",
      "srsly-wrong",
      "colonial-outcasts",
      "black-autonomy",
    ]);

    const nativeRoots = findPodcastShow("native-roots-radio");
    expect(nativeRoots).toBeDefined();
    expect(nativeRoots?.name).toBe("Native Roots Radio");
    expect(nativeRoots?.author).toBe("Robert Pilot");
    expect(nativeRoots?.feedUrl).toBe("https://www.am950radio.com/category/podcasts/im-awake/feed/");
    expect(nativeRoots?.supportUrl).toBe("https://nativerootsradio.com");

    const colonial = findPodcastShow("colonial-outcasts");
    expect(colonial).toBeDefined();
    expect(colonial?.name).toBe("Colonial Outcasts");
    expect(colonial?.author).toBe("Greg Stoker & Mark Wayne");
    expect(colonial?.supportUrl).toBe("https://www.rfemedia.com/subscribe");

    const blackAutonomy = findPodcastShow("black-autonomy");
    expect(blackAutonomy).toBeDefined();
    expect(blackAutonomy?.name).toBe("Black Autonomy Podcast");
    expect(blackAutonomy?.author).toContain("Lorenzo Kom'boa Ervin");
    expect(blackAutonomy?.feedUrl).toBe("https://blackautonomy.libsyn.com/rss");
    expect(blackAutonomy?.supportUrl).toBe("https://www.patreon.com/blackautonomy");

    const everythingCoop = findPodcastShow("everything-coop");
    expect(everythingCoop).toBeDefined();
    expect(everythingCoop?.name).toBe("Everything Co-op");
    expect(everythingCoop?.author).toBe("Vernon Oakes");
    expect(everythingCoop?.feedUrl).toContain("soundcloud.com");
    expect(everythingCoop?.supportUrl).toBe("https://everything.coop");
  });

  test("adds and removes custom client-side podcast feeds", () => {
    const added = upsertCustomPodcast({
      name: "Custom Talk",
      feedUrl: "https://example.com/custom.xml",
      author: "Custom Host",
    });

    expect(getCustomPodcastShows().map((s) => s.id)).toEqual([added.id]);
    expect(findPodcastShow(added.id)?.name).toBe("Custom Talk");

    removeCustomPodcast(added.id);
    expect(getCustomPodcastShows()).toEqual([]);
  });

  test("returns undefined for unknown ID", () => {
    expect(findPodcastShow("unknown-show")).toBeUndefined();
    expect(findPodcastShow("pod-987654")).toBeUndefined();
    expect(findPodcastShow(undefined)).toBeUndefined();
  });
});

describe("Castopod Index discovery", () => {
  beforeEach(() => {
    resetCurationConfig();
  });

  afterEach(() => {
    resetCurationConfig();
  });

  test("maps publisher feed metadata to a stable show ID", () => {
    const show = castopodPodcastToShow({
      id: 123,
      podcastGuid: "4578d9aa-3698-4528-a09a-ed656d8d7194",
      title: "The AssCast",
      author: "NodeZ3r0",
      description: "Independent anti-capitalist audio.",
      artwork: "https://asscast.org/media/podcasts/asscast/cover_feed.png",
      feedUrl: "https://asscast.org/@asscast/feed.xml",
      webUrl: "https://asscast.org/@asscast",
      lastUpdated: "2026-10-12T19:33:30.000Z",
    });

    expect(show.id).toBe("pod-4578d9aa-3698-4528-a09a-ed656d8d7194");
    expect(show.feedUrl).toBe("https://asscast.org/@asscast/feed.xml");
    expect(findPodcastShow(show.id)?.name).toBe("The AssCast");
  });

  test("fetches open Castopod catalog by default and forwards client discovery terms when set", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        podcasts: [
          {
            id: 123,
            podcastGuid: "castopod-test-guid",
            title: "Independent Podcast",
            author: "Independent Publisher",
            description: "A test anarchism podcast",
            artwork: "https://example.com/podcast.png",
            feedUrl: "https://example.com/feed.xml",
            webUrl: "https://example.com/",
            lastUpdated: "2026-10-12T19:33:30.000Z",
          },
        ],
      }),
    } as Response);

    try {
      const openShows = await fetchDiscoveredPodcasts(6);
      const openUrl = new URL(String(fetchSpy.mock.calls[0][0]));
      expect(openUrl.pathname).toBe("/api/podcasts");
      expect(openUrl.searchParams.get("limit")).toBe("6");
      expect(openUrl.searchParams.get("terms")).toBeNull();
      expect(openShows.map((show) => show.id)).toEqual(["pod-castopod-test-guid"]);

      fetchSpy.mockClear();
      setContentFilters({ podcastDiscoveryTerms: ["anarch"] });
      const filteredShows = await fetchDiscoveredPodcasts(6);
      const filteredUrl = new URL(String(fetchSpy.mock.calls[0][0]));
      expect(filteredUrl.searchParams.get("terms")).toBe("anarch");
      expect(filteredShows.map((show) => show.id)).toEqual(["pod-castopod-test-guid"]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("fetchPodcastShowById resolves Castopod and iTunes pod-* shows on cold start", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/podcasts?id=cold-start-guid")) {
        return {
          ok: true,
          json: async () => ({
            podcasts: [
              {
                id: 456,
                podcastGuid: "cold-start-guid",
                title: "Cold Start Castopod",
                author: "Independent Host",
                description: "Desc",
                artwork: "https://example.com/castopod.png",
                feedUrl: "https://example.com/castopod.xml",
              },
            ],
          }),
        } as Response;
      }
      if (url.includes("itunes.apple.com/lookup?id=777888")) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                collectionId: 777888,
                collectionName: "Cold Start iTunes",
                artistName: "iTunes Host",
                feedUrl: "https://example.com/itunes.xml",
                artworkUrl600: "https://example.com/itunes.jpg",
              },
            ],
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    try {
      const castopodShow = await fetchPodcastShowById("pod-cold-start-guid");
      expect(castopodShow?.name).toBe("Cold Start Castopod");
      expect(findPodcastShow("pod-cold-start-guid")).toBe(castopodShow);

      const itunesShow = await fetchPodcastShowById("pod-777888");
      expect(itunesShow?.name).toBe("Cold Start iTunes");
      expect(findPodcastShow("pod-777888")).toBe(itunesShow);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("episodeTrack", () => {
  test("converts PodcastEpisode to valid RNTrack", () => {
    const episode: PodcastEpisode = {
      id: "test-guid-123",
      title: "Test Episode",
      pubDate: "Tue, 06 Oct 2026 18:00:00 GMT",
      audioUrl: "https://example.com/audio.mp3",
      description: "Test description",
      duration: 3600,
      artwork: "https://example.com/custom-art.jpg",
    };

    const track = episodeTrack(episode, COLONIAL_OUTCASTS, 0);

    expect(track.title).toBe("Test Episode");
    expect(track.artist).toBe("Greg Stoker & Mark Wayne");
    expect(track.artwork).toBe("https://example.com/custom-art.jpg");
    expect(track.url).toBe("https://example.com/audio.mp3");
    expect(track.duration).toBe(3600);
    expect(track.headers).toEqual({});
    expect(track.id).toBeLessThan(0);
    expect(track.podcastId).toBe("colonial-outcasts");
    expect(track.podcastEpisodeId).toBe("test-guid-123");
    expect(track.trackGroup?.title).toBe("Colonial Outcasts");
  });

  test("falls back to show artwork when episode has no custom artwork", () => {
    const episode: PodcastEpisode = {
      id: "test-guid-456",
      title: "Episode Without Art",
      pubDate: "Tue, 06 Oct 2026 18:00:00 GMT",
      audioUrl: "https://example.com/audio2.mp3",
      description: "No art",
    };

    const track = episodeTrack(episode, COLONIAL_OUTCASTS, 1);
    expect(track.artwork).toBe(COLONIAL_OUTCASTS.artwork);
  });
});

describe("sortDiscussionsByLastUpdate", () => {
  const { parseDateTimestamp, sortDiscussionsByLastUpdate } = require("@/queries/podcast");

  test("parses ISO 8601, RFC 2822, and handles invalid dates", () => {
    expect(parseDateTimestamp("2026-03-28T14:00:00Z")).toBe(
      new Date("2026-03-28T14:00:00Z").getTime(),
    );
    expect(parseDateTimestamp("Tue, 06 Oct 2026 18:00:00 GMT")).toBe(
      new Date("Tue, 06 Oct 2026 18:00:00 GMT").getTime(),
    );
    expect(parseDateTimestamp(undefined)).toBe(0);
    expect(parseDateTimestamp("invalid-date-string")).toBe(0);
  });

  test("sorts podcast shows descending by lastUpdated (newest first)", () => {
    const shows = [
      { id: "old", name: "Old Show", lastUpdated: "2026-01-01T00:00:00Z" },
      { id: "newest", name: "Newest Show", lastUpdated: "2026-04-10T12:00:00Z" },
      { id: "middle", name: "Middle Show", lastUpdated: "2026-03-15T08:00:00Z" },
      { id: "undated", name: "Undated Show" },
    ];

    const sorted = sortDiscussionsByLastUpdate(shows as any);
    expect(sorted.map((s: { id: string }) => s.id)).toEqual(["newest", "middle", "old", "undated"]);
  });
});

describe("queryDiscussionLatestDates", () => {
  const { queryDiscussionLatestDates } = require("@/queries/podcast");

  test("generates query options for list of shows", () => {
    const shows = [
      { id: "show-a", feedUrl: "https://example.com/feed-a.xml" },
      { id: "show-b", feedUrl: "https://example.com/feed-b.xml" },
    ];
    const options = queryDiscussionLatestDates(shows as any);
    expect(options.queryKey).toEqual(["discussionLatestDates", "show-a,show-b"]);
    expect(options.enabled).toBe(true);
  });
});

describe("podcast exclusion filters", () => {
  beforeEach(() => {
    resetCurationConfig();
  });

  afterEach(() => {
    resetCurationConfig();
  });

  test("allows all podcasts by default and excludes Forbes, charts, top 40, and commercial network names when migrated filters are active", () => {
    expect(isExcludedContent(["Forbes Daily", "Forbes"])).toBe(false);

    loadMigratedCurationPreset();
    expect(isExcludedContent(["Forbes Daily", "Forbes"])).toBe(true);
    expect(isExcludedContent(["What's Ahead", "Steve Forbes"])).toBe(true);
    expect(isExcludedContent(["Top 40 Weekly Hits"])).toBe(true);
    expect(isExcludedContent(["Billboard Hot 100 Chart"])).toBe(true);
    expect(isExcludedContent(["K-Pop Universe"])).toBe(true);
    expect(isExcludedContent(["- 0 N - 2000s Network"])).toBe(true);
    expect(isExcludedContent(["Listen Now -> Click Here"])).toBe(true);

    expect(isExcludedContent(["Working Class History", "Working Class History"])).toBe(false);
    expect(isExcludedContent(["Srsly Wrong", "Shawn Vulliez"])).toBe(false);
  });

  test("searchPodcastShows returns open results by default and applies client-side excluded terms when configured", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            collectionId: 101,
            collectionName: "Forbes Books Podcast",
            artistName: "Forbes Media",
            genres: ["Business", "News"],
            feedUrl: "https://example.com/forbes.xml",
            artworkUrl600: "https://example.com/forbes.jpg",
          },
          {
            collectionId: 102,
            collectionName: "Top 100 Business Leaders",
            artistName: "Corporate Daily",
            genres: ["Business"],
            feedUrl: "https://example.com/top100.xml",
            artworkUrl600: "https://example.com/top100.jpg",
          },
          {
            collectionId: 103,
            collectionName: "Radical Economics",
            artistName: "Community Voice",
            genres: ["News"],
            feedUrl: "https://example.com/radical.xml",
            artworkUrl600: "https://example.com/radical.jpg",
          },
        ],
      }),
    } as Response);

    try {
      const openResults = await searchPodcastShows("economics");
      expect(openResults.some((s) => s.name.toLowerCase().includes("forbes"))).toBe(true);
      expect(openResults.some((s) => s.name === "Radical Economics")).toBe(true);

      loadMigratedCurationPreset();
      const filteredResults = await searchPodcastShows("economics");
      expect(filteredResults.some((s) => s.name.toLowerCase().includes("forbes"))).toBe(false);
      expect(filteredResults.some((s) => s.name.toLowerCase().includes("top 100"))).toBe(false);
      expect(filteredResults.some((s) => s.name === "Radical Economics")).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
