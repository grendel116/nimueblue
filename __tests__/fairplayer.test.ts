import {
  blockFaircampDomain,
  combineFaircampAbout,
  fetchFairplayerAlbum,
  fetchFairplayerAlbums,
  fetchFairplayerArtist,
  fetchFairplayerDiscoveryTracks,
  fetchFairplayerSongReleaseSlug,
  fairplayerReleaseSlug,
  getFaircampReleaseUrl,
  isFaircampDomainBlocked,
  parseFaircampPageDetails,
  parseFairplayerRelease,
  parseFairplayerReleaseCards,
  parseFairplayerSearchResults,
  parseVerifiedFaircampCatalogs,
  searchFairplayerAlbums,
} from "@/queries/fairplayer";
import { isSafeExternalUrl } from "@/scripts/openInBrowser";

describe("Fairplayer Faircamp catalog integration", () => {
  test("decodes single and double-encoded release slugs including subpath hosts", () => {
    expect(
      fairplayerReleaseSlug.decode(
        "fairplayer-le-noel-des-bergers-album%40boulyprod.net%3Amusic",
      ),
    ).toBe("le-noel-des-bergers-album@boulyprod.net:music");
    expect(
      fairplayerReleaseSlug.decode(
        "fairplayer-le-noel-des-bergers-album%2540boulyprod.net%253Amusic",
      ),
    ).toBe("le-noel-des-bergers-album@boulyprod.net:music");
    expect(
      getFaircampReleaseUrl("le-noel-des-bergers-album@boulyprod.net:music"),
    ).toBe("https://boulyprod.net/music/le-noel-des-bergers-album/");
  });

  test("uses the Fairplayer artist route for Faircamp release slugs", () => {
    expect(
      fairplayerReleaseSlug.artistRouteId(
        "fairplayer-primer-calaix%40sockpuppet.band",
      ),
    ).toBe("fairplayer");
    expect(
      fairplayerReleaseSlug.artistRouteId(
        "fairplayer-le-noel-des-bergers-album%2540boulyprod.net%253Amusic",
      ),
    ).toBe("fairplayer");
    expect(fairplayerReleaseSlug.artistRouteId("a-mirlo-album")).toBeUndefined();
  });

  test("resolves Fairplayer song IDs to their Faircamp album slug", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () =>
          Promise.resolve(`
            <div class="song" data-id="8153"
              data-releaseUrl="/player/release/primer-calaix@sockpuppet.band">
            </div>
          `),
      } as Response),
    );

    try {
      await expect(fetchFairplayerSongReleaseSlug("8153")).resolves.toBe(
        "fairplayer-primer-calaix%40sockpuppet.band",
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/fairplayer\/player\/song\/8153$/),
        expect.objectContaining({ headers: { Accept: "text/html" } }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("resolves synthetic Fairplayer track IDs without a song-page request", async () => {
    await expect(
      fetchFairplayerSongReleaseSlug("primer-calaix@sockpuppet.band#2"),
    ).resolves.toBe("fairplayer-primer-calaix%40sockpuppet.band");
  }  );
  test("fetches the Fairplayer directory and filters it through verified hub catalogs", async () => {
    const originalFetch = global.fetch;
    const directory = `
      <a hx-get="/player/release/sjX@sockpuppet.band">
        <img src="https://images.example/sjx.jpg">
        <p title="sjX">sjX</p>
        <p>Sockpuppet</p>
      </a>
      <a hx-get="/player/release/other@not-verified.example">
        <img src="https://images.example/other.jpg">
        <p title="Other">Other</p>
        <p>Other Artist</p>
      </a>
    `;
    const hub = `
      <a href="https://sockpuppet.band/music">
        <span class="bg-success"></span>
        <span>Faircamp</span>
      </a>
    `;
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith("/fairplayer/hub") ? hub : directory;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(body),
      } as Response);
    });

    try {
      const albums = await fetchFairplayerAlbums(10);

      expect(albums).toHaveLength(1);
      expect(albums[0].sourceUrl).toBe("https://sockpuppet.band/music/sjX/");
      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("parses Fairplayer release IDs using their catalog host", () => {
    const albums = parseFairplayerReleaseCards(`
      <a hx-get="/player/release/sjX@sockpuppet.band">
        <img src="https://images.example/sjx.jpg">
        <p title="sjX">sjX</p>
        <p>Sockpuppet</p>
      </a>
      <a hx-get="/player/release/123@mirlo.space">
        <img src="https://images.example/mirlo.jpg">
        <p title="Mirlo album">Mirlo album</p>
        <p>Mirlo Artist</p>
      </a>
    `);

    expect(albums).toHaveLength(2);
    expect(albums[0].title).toBe("sjX");
    expect(albums[0].artist.name).toBe("Sockpuppet");
    expect(albums[0].source).toBe("Faircamp");
    expect(albums[0].sourceUrl).toBe("https://sockpuppet.band/sjX/");
    expect(albums[0].urlSlug).toBe(
      fairplayerReleaseSlug.encode("sjX@sockpuppet.band"),
    );
  });

  test("reads verified Faircamp domains from catalog cards only", () => {
    const catalogs = parseVerifiedFaircampCatalogs(`
      <a href="https://sockpuppet.band/music">
        <span class="bg-success"></span>
        <span>Faircamp</span>
      </a>
      <a href="https://not-verified.example/music">
        <span>Faircamp</span>
      </a>
      <a href="https://mirlo.space">
        <span class="bg-success"></span>
        <span>Mirlo</span>
      </a>
    `);

    expect([...catalogs]).toEqual([
      ["sockpuppet.band", "https://sockpuppet.band/music"],
    ]);
  });

  test("parses album search results with host-based release IDs", () => {
    const albums = parseFairplayerSearchResults({
      items: [
        {
          type: "album",
          name: "sjX",
          url: "https://fairplayer.band/player/release/sjX@sockpuppet.band",
          artist: "Sockpuppet",
          images: { default: { src: "https://images.example/sjx.jpg" } },
        },
        {
          type: "album",
          name: "Mirlo album",
          url: "https://fairplayer.band/player/release/123@mirlo.space",
          artist: "Mirlo Artist",
        },
        {
          type: "track",
          name: "A track",
          url: "https://fairplayer.band/player/song/10",
          artist: "Sockpuppet",
        },
      ],
    });

    expect(albums).toHaveLength(2);
    expect(albums[0].title).toBe("sjX");
    expect(albums[0].cover.sizes[600]).toBe("https://images.example/sjx.jpg");
  });

  test("filters search results through verified Faircamp catalogs", async () => {
    const originalFetch = global.fetch;
    const hub = `
      <a href="https://sockpuppet.band/music">
        <span class="bg-success"></span>
        <span>Faircamp</span>
      </a>
    `;
    const searchResults = {
      items: [
        {
          type: "album",
          name: "sjX",
          url: "https://fairplayer.band/player/release/sjX@sockpuppet.band",
          artist: "Sockpuppet",
        },
        {
          type: "album",
          name: "Mirlo album",
          url: "https://fairplayer.band/player/release/123@mirlo.space",
          artist: "Mirlo Artist",
        },
      ],
    };
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/fairplayer/hub")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          text: () => Promise.resolve(hub),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(searchResults),
      } as Response);
    });

    try {
      const albums = await searchFairplayerAlbums("sockpuppet");

      expect(albums).toHaveLength(1);
      expect(albums[0].title).toBe("sjX");
      expect(albums[0].sourceUrl).toBe("https://sockpuppet.band/music/sjX/");
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("converts release details to direct, unauthenticated Faircamp audio tracks", () => {
    const album = parseFairplayerRelease(
      `
        <h1>sjX</h1>
        <div class="song"
          data-id="10483"
          data-title="The War Machine"
          data-duration="252"
          data-url="https://sockpuppet.band/sjx/01-war-machine.opus"
          data-image="https://images.example/sjx.jpg"
          data-artist="Sockpuppet">
        </div>
      `,
      fairplayerReleaseSlug.encode("sjX@sockpuppet.band"),
    );

    expect(album.title).toBe("sjX");
    expect(album.about).toBe("");
    expect(album.artist.name).toBe("Sockpuppet");
    expect(album.tracks).toHaveLength(1);
    expect(album.tracks?.[0].url).toBe(
      "https://sockpuppet.band/sjx/01-war-machine.opus",
    );
    expect(album.tracks?.[0].headers).toEqual({});
    expect(album.tracks?.[0].isPreview).toBe(true);
    expect(album.tracks?.[0].sourceUrl).toBe("https://sockpuppet.band/sjx/");
  });

  test("reads the Faircamp release description for the About section", () => {
    const album = parseFairplayerRelease(
      `
        <h1>sjX</h1>
        <div class="text-low line-clamp-4 text-lg text-md:sm">
          <p>A release description with &amp; decoded text.</p>
        </div>
        <div class="song"
          data-id="10483"
          data-title="The War Machine"
          data-duration="252"
          data-url="https://sockpuppet.band/sjx/01-war-machine.opus"
          data-image="https://images.example/sjx.jpg"
          data-artist="Sockpuppet">
        </div>
      `,
      fairplayerReleaseSlug.encode("sjX@sockpuppet.band"),
    );

    expect(album.about).toBe("A release description with & decoded text.");
  });

  test("extracts abstract, page_more About markdown, banner image, and external links from Faircamp HTML", () => {
    const html = `
      <html>
        <head>
          <meta property="og:description" content="Clemens Pitschke is an acoustical engineer and sound recordist based in Dresden Germany.">
        </head>
        <body>
          <div class="page_split">
            <span class="home_image">
              <img class="home_image" src="image_fixed_640x284.jpg">
            </span>
            <div class="abstract">
              <h1>Clemens Pitschke</h1>
              <div>Clemens Pitschke is an acoustical engineer and sound recordist based in Dresden Germany.</div>
              <div class="actions">
                <a href="https://landschafftsound.org/" target="_blank">
                  <svg><title>External Link</title></svg>
                  <span>Land.Schafft.Sound</span>
                </a>
              </div>
            </div>
          </div>
          <div class="page_more">
            <h1>Clemens Pitschke</h1>
            <div class="text">
              <p>Field recordings and adventures in sound.<br>
              Co-founder of <a href="https://landschafftsound.org/">Land.Schafft.Sound</a>.<br>
              .<br>
              All work licensed under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY NC SA</a></p>
              <p><a href="https://faircamp.webr.ing/prev/clemenspitschke.de">← prev</a> | <a href="https://faircamp.webr.ing/">faircamp webring</a></p>
            </div>
          </div>
        </body>
      </html>
    `;

    const details = parseFaircampPageDetails(html, "https://clemenspitschke.de/");
    expect(details.abstractText).toBe(
      "Clemens Pitschke is an acoustical engineer and sound recordist based in Dresden Germany.",
    );
    expect(details.aboutMarkdown).toContain("Field recordings and adventures in sound.");
    expect(details.aboutMarkdown).toContain("[Land.Schafft.Sound](https://landschafftsound.org/)");
    expect(details.aboutMarkdown).not.toContain("faircamp.webr.ing");
    expect(details.bannerUrl).toBe("https://clemenspitschke.de/image_fixed_640x284.jpg");
    expect(details.links).toEqual([
      { url: "https://landschafftsound.org/", linkLabel: "Land.Schafft.Sound" },
    ]);

    const combined = combineFaircampAbout(
      details.abstractText,
      details.aboutMarkdown,
      "https://clemenspitschke.de/",
    );
    expect(combined).toContain("acoustical engineer");
    expect(combined).toContain("Field recordings and adventures in sound.");
    expect(combined).toContain("Faircamp catalog: https://clemenspitschke.de/");
  });

  test("encodes and resolves Faircamp artist page route IDs and site URLs", () => {
    const albumSlug = fairplayerReleaseSlug.encode("sjX@sockpuppet.band");
    const artistSlug = fairplayerReleaseSlug.encodeArtist("Sockpuppet");

    expect(fairplayerReleaseSlug.decodeArtist(artistSlug)).toBe("Sockpuppet");
    expect(fairplayerReleaseSlug.siteUrl(albumSlug)).toBe("https://sockpuppet.band/sjX/");
    expect(
      fairplayerReleaseSlug.artistPageRouteId({
        urlSlug: albumSlug,
        artist: { name: "Sockpuppet", urlSlug: "sockpuppet" },
      }),
    ).toBe(artistSlug);
  });

  test("reuses cached verified catalog map across album fetches and resolves artist discography and bio", async () => {
    const originalFetch = global.fetch;
    const hub = `
      <a href="https://sockpuppet.band/music">
        <span class="bg-success"></span>
        <span>Faircamp</span>
      </a>
    `;
    const releaseHtml = `
      <h1>sjX</h1>
      <div class="song"
        data-id="10483"
        data-title="The War Machine"
        data-duration="252"
        data-url="https://sockpuppet.band/music/sjX/01-war-machine.opus"
        data-image="https://images.example/sjx.jpg"
        data-artist="Sockpuppet">
      </div>
    `;
    const faircampArtistHtml = `
      <div class="page_split">
        <img class="home_image" src="banner.jpg">
        <div class="abstract">
          <h1>Sockpuppet</h1>
          <div>Totally a real band and not just one person pretending</div>
        </div>
      </div>
      <div class="page_more">
        <div class="text">
          <p>More about the band on <a href="https://ko-fi.com/fluffycritter">Ko-fi</a>.</p>
        </div>
      </div>
    `;
    let hubFetchCount = 0;
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/fairplayer/hub")) {
        hubFetchCount += 1;
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          text: () => Promise.resolve(hub),
        } as Response);
      }
      if (url.includes("/fairplayer/page")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          text: () => Promise.resolve(faircampArtistHtml),
        } as Response);
      }
      if (url.includes("/fairplayer/search")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () =>
            Promise.resolve({
              items: [
                {
                  type: "artist",
                  name: "Sockpuppet",
                  uid: "band-sockpuppet@sockpuppet.band",
                  description: "Totally a real band and not just one person pretending",
                  images: { default: { src: "https://images.example/artist-avatar.jpg" } },
                },
                {
                  type: "album",
                  name: "sjX",
                  url: "https://fairplayer.band/player/release/sjX@sockpuppet.band",
                  artist: "Sockpuppet",
                  images: { default: { src: "https://images.example/sjx.jpg" } },
                },
              ],
            }),
        } as Response);
      }
      if (url.includes("/fairplayer/album")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () =>
            Promise.resolve({
              releaseHtml,
              catalogUrl: "https://sockpuppet.band/music",
              releaseUrl: "https://sockpuppet.band/music/sjX/",
              pageHtml: faircampArtistHtml,
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(releaseHtml),
      } as Response);
    });

    try {
      const slug = fairplayerReleaseSlug.encode("sjX@sockpuppet.band");
      const firstAlbum = await fetchFairplayerAlbum(slug);
      const secondAlbum = await fetchFairplayerAlbum(slug);

      expect(firstAlbum.sourceUrl).toBe("https://sockpuppet.band/music/sjX/");
      expect(secondAlbum.sourceUrl).toBe("https://sockpuppet.band/music/sjX/");
      expect(hubFetchCount).toBe(0);

      const artist = await fetchFairplayerArtist(
        fairplayerReleaseSlug.encodeArtist("Sockpuppet"),
      );
      expect(hubFetchCount).toBe(1);
      await fetchFairplayerArtist(
        fairplayerReleaseSlug.encodeArtist("Sockpuppet"),
      );
      expect(hubFetchCount).toBe(1);
      expect(artist).toBeDefined();
      expect(artist?.name).toBe("Sockpuppet");
      expect(artist?.avatar?.sizes?.[600]).toBe("https://images.example/artist-avatar.jpg");
      expect(artist?.background?.sizes?.["1024"]).toBe("https://sockpuppet.band/music/banner.jpg");
      expect(artist?.bio).toContain("Totally a real band and not just one person pretending");
      expect(artist?.bio).toContain("[Ko-fi](https://ko-fi.com/fluffycritter)");
      expect(artist?.bio).toContain("Faircamp catalog: https://sockpuppet.band/music");
      expect(artist?.trackGroups?.length).toBeGreaterThanOrEqual(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("samples discovery tracks from verified Faircamp releases with autoplay metadata", async () => {
    const originalFetch = global.fetch;
    const directory = `
      <a hx-get="/player/release/sjX@sockpuppet.band">
        <img src="https://images.example/sjx.jpg">
        <p title="sjX">sjX</p>
        <p>Sockpuppet</p>
      </a>
    `;
    const hub = `
      <a href="https://sockpuppet.band/music">
        <span class="bg-success"></span>
        <span>Faircamp</span>
      </a>
    `;
    const releaseHtml = `
      <h1>sjX</h1>
      <div class="song"
        data-id="10483"
        data-title="The War Machine"
        data-duration="252"
        data-url="https://sockpuppet.band/sjx/01-war-machine.opus"
        data-image="https://images.example/sjx.jpg"
        data-artist="Sockpuppet">
      </div>
    `;
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/fairplayer/album")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () =>
            Promise.resolve({
              releaseHtml,
              catalogUrl: "https://sockpuppet.band/music",
              releaseUrl: "https://sockpuppet.band/music/sjX/",
              pageHtml: null,
            }),
        } as Response);
      }
      const body = url.endsWith("/fairplayer/hub")
        ? hub
        : url.endsWith("/fairplayer/player/all/releases")
          ? directory
          : releaseHtml;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(body),
      } as Response);
    });

    try {
      const tracks = await fetchFairplayerDiscoveryTracks(2);
      expect(tracks).toHaveLength(1);
      expect(tracks[0].title).toBe("The War Machine");
      expect(tracks[0].autoplay).toBe(true);
      expect(tracks[0].source).toBe("Faircamp");
      expect(tracks[0].url).toBe("https://sockpuppet.band/sjx/01-war-machine.opus");
      expect(tracks[0].trackGroup).not.toHaveProperty("tracks");
      expect(() => JSON.stringify(tracks[0])).not.toThrow();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("rejects blocked, insecure HTTP, and non-standard port Faircamp catalogs and cross-origin tracks", () => {
    expect(isFaircampDomainBlocked("https://faircamp.txels.art")).toBe(true);
    expect(isFaircampDomainBlocked("txels.art")).toBe(true);
    expect(isSafeExternalUrl("https://faircamp.txels.art")).toBe(false);
    expect(isSafeExternalUrl("http://sknam.nham.co.uk")).toBe(false);
    expect(isSafeExternalUrl("https://amicpublic.remor.net:8443/")).toBe(false);
    expect(isSafeExternalUrl("https://sockpuppet.band/music")).toBe(true);

    const catalogs = parseVerifiedFaircampCatalogs(`
      <a href="https://faircamp.txels.art">
        <span class="bg-success"></span>
        <span>Faircamp</span>
      </a>
      <a href="http://sknam.nham.co.uk">
        <span class="bg-success"></span>
        <span>Faircamp</span>
      </a>
      <a href="https://amicpublic.remor.net:8443">
        <span class="bg-success"></span>
        <span>Faircamp</span>
      </a>
      <a href="https://sockpuppet.band/music">
        <span class="bg-success"></span>
        <span>Faircamp</span>
      </a>
    `);
    expect([...catalogs.keys()]).toEqual(["sockpuppet.band"]);

    const cards = parseFairplayerReleaseCards(`
      <a hx-get="/player/release/lento@txels.art">
        <img src="https://images.example/lento.jpg">
        <p title="Lento">Lento</p>
        <p>Carles Barrobés</p>
      </a>
      <a hx-get="/player/release/sjX@sockpuppet.band">
        <img src="https://images.example/sjx.jpg">
        <p title="sjX">sjX</p>
        <p>Sockpuppet</p>
      </a>
    `);
    expect(cards.map((album) => album.title)).toEqual(["sjX"]);

    const releaseWithUntrustedStreams = parseFairplayerRelease(
      `
        <h1>sjX</h1>
        <div class="song"
          data-id="1"
          data-title="Valid Track"
          data-duration="120"
          data-url="https://sockpuppet.band/sjx/01.opus">
        </div>
        <div class="song"
          data-id="2"
          data-title="HTTP Downgrade Track"
          data-duration="120"
          data-url="http://sockpuppet.band/sjx/02.opus">
        </div>
        <div class="song"
          data-id="3"
          data-title="Cross-Origin Malware Track"
          data-duration="120"
          data-url="https://evil.example/payload.opus">
        </div>
      `,
      fairplayerReleaseSlug.encode("sjX@sockpuppet.band"),
    );
    expect(releaseWithUntrustedStreams.tracks?.map((t) => t.title)).toEqual([
      "Valid Track",
    ]);

    blockFaircampDomain("https://quarantined-node.example/track.opus");
    expect(isFaircampDomainBlocked("quarantined-node.example")).toBe(true);
    expect(isSafeExternalUrl("https://quarantined-node.example")).toBe(false);
  });

  test("fetches album bundle in a single pass with tracks and rich about", async () => {
    const originalFetch = global.fetch;
    const releaseHtml = `
      <h1>sjX</h1>
      <div class="song"
        data-id="10483"
        data-title="The War Machine"
        data-duration="252"
        data-url="https://sockpuppet.band/sjx/01-war-machine.opus"
        data-image="https://images.example/sjx.jpg"
        data-artist="Sockpuppet">
      </div>
    `;
    const pageHtml = `
      <html>
        <body>
          <div class="page_more">
            <div class="text"><p>Album liner notes and story.</p></div>
          </div>
          <div class="action_buttons">
            <a href="bezahlen/AbCdEfGhI_k/"><span>Download</span></a>
          </div>
        </body>
      </html>
    `;
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/fairplayer/album?releaseId=sjX%40sockpuppet.band");
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () =>
          Promise.resolve({
            releaseId: "sjX@sockpuppet.band",
            releaseHtml,
            catalogUrl: "https://sockpuppet.band/music",
            releaseUrl: "https://sockpuppet.band/sjx/",
            pageHtml,
          }),
      } as Response);
    });

    try {
      const album = await fetchFairplayerAlbum(
        fairplayerReleaseSlug.encode("sjX@sockpuppet.band"),
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(album.title).toBe("sjX");
      expect(album.tracks).toHaveLength(1);
      expect(album.tracks?.[0].title).toBe("The War Machine");
      expect(album.about).toContain("Album liner notes and story.");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

