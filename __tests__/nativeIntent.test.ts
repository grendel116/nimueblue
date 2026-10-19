import { redirectSystemPath } from "@/app/+native-intent";
import { MirloFetchError } from "@/queries/fetch/MirloFetchError";
import { queryClient } from "@/queries/QueryClientWrapper";
import { fetchFairplayerSongReleaseSlug } from "@/queries/fairplayer";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

jest.mock("@preeternal/react-native-cookie-manager", () => ({
  __esModule: true,
  default: { get: jest.fn(), getAll: jest.fn(), clearAll: jest.fn() },
}));
jest.mock("@/queries/fairplayer", () => ({
  ...jest.requireActual("@/queries/fairplayer"),
  fetchFairplayerSongReleaseSlug: jest.fn(),
}));
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(),
  getCustomTabsSupportingBrowsersAsync: jest.fn(async () => ({
    preferredBrowserPackage: "com.android.chrome",
    browserPackages: ["com.android.chrome"],
  })),
}));
const openBrowserAsync = WebBrowser.openBrowserAsync as jest.Mock;

// Mock queryClient to support both artist validation and track lookup
jest
  .spyOn(queryClient, "fetchQuery")
  .mockImplementation(async ({ queryKey }: any) => {
    if (queryKey[0] === "track") {
      const trackId = queryKey[1];
      if (trackId === "42") {
        return {
          result: {
            id: 42,
            trackGroup: {
              artist: { urlSlug: "arod" },
              urlSlug: "penaflor-single",
            },
          },
        };
      }
      return Promise.reject(
        new MirloFetchError({ status: 404 } as Response, "Track not found"),
      );
    }
    const artistOpts = queryKey[1];
    return artistOpts?.artistSlug === "arod"
      ? { id: 4 }
      : Promise.reject(
          new MirloFetchError({ status: 404 } as Response, "Artist not found"),
        );
  });

const redirect = (path: string) => redirectSystemPath({ path, initial: false });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("redirectSystemPath", () => {
  test("maps artist, release and track links to app routes", async () => {
    expect(await redirect("https://mirlo.space/arod")).toBe(
      "/artist/arod/artist-page",
    );
    expect(await redirect("https://mirlo.space/arod/releases")).toBe(
      "/artist/arod/artist-page",
    );
    expect(
      await redirect("https://mirlo.space/arod/release/penaflor-single"),
    ).toBe("/artist/arod/album/penaflor-single/album-tracks");
    expect(
      await redirect(
        "https://mirlo.space/arod/release/penaflor-single/tracks/12?x=1",
      ),
    ).toBe("/artist/arod/album/penaflor-single/album-tracks");
    expect(await redirect("https://mirlo.space/")).toBe("/");
  });

  test("opens web-only links in the browser without navigating", async () => {
    for (const p of [
      "https://mirlo.space/login",
      "https://mirlo.space/manage/artists/4",
      "https://mirlo.space/arod/release/x/download",
      "https://mirlo.space/arod/posts/5",
    ]) {
      expect(await redirect(p)).toBe("");
      await flush();
      expect(openBrowserAsync.mock.calls.at(-1)[0]).toBe(p);
    }
  });

  test("still opens the artist page when the API check fails for another reason", async () => {
    (queryClient.fetchQuery as jest.Mock).mockRejectedValueOnce(
      new TypeError("Network request failed"),
    );
    expect(await redirect("https://mirlo.space/someone")).toBe(
      "/artist/someone/artist-page",
    );
  });

  test("names an explicit browser package on Android so the link can't loop back", async () => {
    Platform.OS = "android";
    await redirect("https://mirlo.space/login");
    await flush();
    expect(openBrowserAsync.mock.calls.at(-1)[1]).toEqual({
      browserPackage: "com.android.chrome",
    });
    Platform.OS = "ios";
  });

  test("maps nimueblue: and mirloblue: custom schemes to internal app routes", async () => {
    expect(await redirect("nimueblue://station/wfmu")).toBe("/station/wfmu");
    expect(await redirect("nimueblue://podcast/srsly-wrong")).toBe(
      "/podcast/srsly-wrong",
    );
    expect(await redirect("mirloblue://station/wfmu")).toBe("/station/wfmu");
    expect(await redirect("mirloblue://podcast/srsly-wrong")).toBe(
      "/podcast/srsly-wrong",
    );
    expect(
      await redirect("nimueblue://artist/arod/album/single/tracks/42"),
    ).toBe("/artist/arod/album/single/album-tracks");
    expect(
      await redirect("nimueblue://artist/arod/album/single"),
    ).toBe("/artist/arod/album/single/album-tracks");
    expect(
      await redirect("nimueblue://artist/arod"),
    ).toBe("/artist/arod/artist-page");
    expect(
      await redirect("intent://artist/arod/album/single#Intent;scheme=nimueblue;package=space.mirlo.blue;end"),
    ).toBe("/artist/arod/album/single/album-tracks");
    expect(await redirect("intent://station/wfmu#Intent;scheme=nimueblue;package=space.mirlo.blue;end")).toBe(
      "/station/wfmu",
    );
  });

  test("extracts app route parameter from grendel116.github.io listen hub URL", async () => {
    expect(
      await redirect(
        "https://grendel116.github.io/nimueblue/listen/?type=radio&app=%2Fstation%2Fwfmu",
      ),
    ).toBe("/station/wfmu");
  });

  test("resolves track short links (/t/:id) across share hubs and mirlo.space", async () => {
    expect(
      await redirect("https://nimueblue-share.nimueblue.workers.dev/t/42"),
    ).toBe("/artist/arod/album/penaflor-single/album-tracks");
    expect(
      await redirect("https://nimueblue-share.nimueblue.workers.dev/listen/t/42"),
    ).toBe("/artist/arod/album/penaflor-single/album-tracks");
    expect(
      await redirect("https://mirlo.space/t/42"),
    ).toBe("/artist/arod/album/penaflor-single/album-tracks");
  });

  test("opens short Faircamp track links at the release page", async () => {
    jest
      .mocked(fetchFairplayerSongReleaseSlug)
      .mockResolvedValue("fairplayer-primer-calaix%40calaixdesastre.online");
    expect(
      await redirect(
        "https://nimueblue-share.nimueblue.workers.dev/t/f8153",
      ),
    ).toBe(
      "/artist/fairplayer/album/fairplayer-primer-calaix%40calaixdesastre.online/album-tracks",
    );
    expect(fetchFairplayerSongReleaseSlug).toHaveBeenCalledWith("8153");
  });

  test("handles workers.dev short routes for stations and podcasts", async () => {
    expect(
      await redirect("https://nimueblue-share.nimueblue.workers.dev/r/wfmu"),
    ).toBe("/station/wfmu");
    expect(
      await redirect(
        "https://nimueblue-share.nimueblue.workers.dev/p/colonial-outcasts",
      ),
    ).toBe("/podcast/colonial-outcasts");
    expect(
      await redirect(
        "https://nimueblue-share.nimueblue.workers.dev/?app=%2Fstation%2Fkexp",
      ),
    ).toBe("/station/kexp");
  });

  test("opens artist short links (/art/:slug) from share hubs at the artist page", async () => {
    expect(
      await redirect("https://nimueblue-share.nimueblue.workers.dev/art/mowukis"),
    ).toBe("/artist/mowukis/artist-page");
    expect(
      await redirect("https://nimueblue-share.nimueblue.workers.dev/listen/art/mowukis/"),
    ).toBe("/artist/mowukis/artist-page");
  });

  test("leaves other URLs untouched", async () => {
    expect(await redirect("other:///artist/arod/artist-page")).toBe(
      "other:///artist/arod/artist-page",
    );
    expect(await redirect("not a url")).toBe("not a url");
  });
});
