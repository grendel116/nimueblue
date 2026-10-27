import worker from "../worker/src/index";

const verifiedHub = `
  <a href="https://sockpuppet.band/music">
    <span class="bg-success"></span>
    <span>Faircamp</span>
  </a>
`;

const releasePage = `
  <div class="song" data-id="8153" data-title="La del cowboy" data-release="Primer calaix"
    data-duration="166" data-url="https://sockpuppet.band/audio/first.opus"
    data-image="https://images.example/cover.jpg"
    data-releaseUrl="/player/release/primer-calaix@sockpuppet.band"
    data-artist="Calaix desastre"></div>
`;

describe("Faircamp short share links", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test("renders Faircamp track metadata, artwork, and a 10-second preview", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(
        url.endsWith("/hub/") ? verifiedHub : releasePage,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request("https://share.example/t/f8153"),
      {},
      {},
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("La del cowboy");
    expect(html).toContain("Calaix desastre");
    expect(html).toContain("https://sockpuppet.band/audio/first.opus");
    expect(html).toContain(
      "https://share.example/image?url=https%3A%2F%2Fimages.example%2Fcover.jpg",
    );
    expect(html).toContain("SAMPLE_LIMIT = 10");
    expect(html).toContain("Visit Faircamp Catalog");
    expect(html).toContain(
      "/artist/fairplayer/album/fairplayer-primer-calaix%40sockpuppet.band/album-tracks",
    );
  });

  test("does not create share previews for catalogs not verified by Fairplayer", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(
        url.endsWith("/hub/")
          ? '<a href="https://sockpuppet.band/music"><span>Faircamp</span></a>'
          : releasePage,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request("https://share.example/t/f8153"),
      {},
      {},
    );

    expect(response.status).toBe(404);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("resolves compact Mirlo track links without changing their numeric ID", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://mirlo.space/v1/tracks/34357");
      return Response.json({
        result: {
          title: "A Mirlo song",
          trackGroup: {
            artist: { name: "Mirlo Artist", urlSlug: "mirlo-artist" },
            title: "A Mirlo album",
            urlSlug: "mirlo-album",
            cover: { sizes: { 600: "https://images.example/mirlo.jpg" } },
          },
        },
      });
    }) as typeof fetch;

    const response = await worker.fetch(
      new Request("https://share.example/t/34357"),
      {},
      {},
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("A Mirlo song");
    expect(html).toContain("Mirlo Artist");
    expect(html).toContain("https://mirlo.space/v1/tracks/34357/stream/playlist.m3u8");
  });

  test("bundles Faircamp album with subpath catalog domain and double-encoded release ID", async () => {
    const hubWithSubpath = `
      <a href="https://boulyprod.net/music" target="_blank">
        <div class="bg-success" title="Verificat"></div>
        <span>Faircamp</span>
        <p>boulyprod.net</p>
      </a>
    `;
    const boulyReleasePage = `
      <h1>Le Noël des bergers</h1>
      <div class="song" data-id="17009" data-title="Moutons et bergers"
        data-duration="120" data-url="https://boulyprod.net/music/le-noel-des-bergers-album-moutons-et-bergers/opus-96/track1.opus"
        data-image="https://boulyprod.net/music/cover.jpg"
        data-artist="Mariane Bourgeoisat"></div>
    `;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/hub/")) {
        return new Response(hubWithSubpath, { status: 200, headers: { "Content-Type": "text/html" } });
      }
      if (url.includes("fairplayer.band/player/release/")) {
        return new Response(boulyReleasePage, { status: 200, headers: { "Content-Type": "text/html" } });
      }
      if (url.includes("boulyprod.net/music/")) {
        return new Response("<html><body>Bouly Artist Page</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    // Test with double-encoded releaseId
    const res = await worker.fetch(
      new Request(
        "https://share.example/fairplayer/album?releaseId=le-noel-des-bergers-album%2540boulyprod.net%253Amusic",
      ),
      {},
      {},
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.releaseId).toBe("le-noel-des-bergers-album@boulyprod.net:music");
    expect(data.catalogUrl).toBe("https://boulyprod.net/music");
    expect(data.releaseUrl).toBe("https://boulyprod.net/music/le-noel-des-bergers-album/");
    expect(data.releaseHtml).toContain("Le Noël des bergers");
  });
});
