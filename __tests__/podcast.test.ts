import {
  decodeXml,
  parseDuration,
  parsePodcastRss,
  findPodcastShow,
  episodeTrack,
  COLONIAL_OUTCASTS,
  PODCAST_SHOWS,
  PodcastEpisode,
  castopodPodcastToShow,
  fetchDiscoveredPodcasts,
} from "@/queries/podcast";

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
});

describe("findPodcastShow", () => {
  test("finds shows by ID and verifies list contains ongoing curated shows", () => {
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

  test("returns undefined for unknown ID", () => {
    expect(findPodcastShow("unknown-show")).toBeUndefined();
    expect(findPodcastShow("pod-987654")).toBeUndefined();
    expect(findPodcastShow(undefined)).toBeUndefined();
  });
});

describe("Castopod Index discovery", () => {
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

  test("fetches filtered podcast metadata from the share Worker", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        podcasts: [
          {
            id: 123,
            podcastGuid: "castopod-test-guid",
            title: "Independent Podcast",
            author: "Independent Publisher",
            description: "A test podcast",
            artwork: "https://example.com/podcast.png",
            feedUrl: "https://example.com/feed.xml",
            webUrl: "https://example.com/",
            lastUpdated: "2026-10-12T19:33:30.000Z",
          },
        ],
      }),
    } as Response);

    try {
      const shows = await fetchDiscoveredPodcasts(6);
      expect(fetchSpy.mock.calls[0][0]).toContain("/api/podcasts?limit=6");
      expect(shows.map((show) => show.id)).toEqual(["pod-castopod-test-guid"]);
      expect(shows[0].feedUrl).toBe("https://example.com/feed.xml");
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
