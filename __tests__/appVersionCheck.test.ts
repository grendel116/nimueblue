import {
  checkAndroidVersion,
  compareVersions,
  isVersionGreater,
} from "@/scripts/appVersionCheck";

describe("compareVersions", () => {
  test("returns 0 for equal versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("2.3.4", "2.3.4")).toBe(0);
  });

  test("returns 1 when v1 is greater", () => {
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
  });

  test("returns -1 when v1 is smaller", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(compareVersions("1.99.99", "2.0.0")).toBe(-1);
    expect(compareVersions("1.9.0", "1.10.0")).toBe(-1);
  });

  test("pads shorter versions with zeros", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1", "1.0.0")).toBe(0);
    expect(compareVersions("1.1", "1.0.5")).toBe(1);
  });

  test("strips non-numeric characters except dots", () => {
    expect(compareVersions("v1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.1-rc1", "1.0.0")).toBe(1);
  });

  test("handles build numbers vs semver-style", () => {
    expect(compareVersions("42", "41")).toBe(1);
    expect(compareVersions("100", "99")).toBe(1);
  });
});

describe("isVersionGreater", () => {
  test("true when v1 > v2", () => {
    expect(isVersionGreater("1.0.1", "1.0.0")).toBe(true);
    expect(isVersionGreater("2.0.0", "1.99.99")).toBe(true);
    expect(isVersionGreater("1.0.7", "1.0.6")).toBe(true);
  });

  test("false when v1 == v2", () => {
    expect(isVersionGreater("1.0.0", "1.0.0")).toBe(false);
  });

  test("false when v1 < v2", () => {
    expect(isVersionGreater("1.0.0", "1.0.1")).toBe(false);
  });
});

describe("checkAndroidVersion", () => {
  test("resolves the latest GitHub release version and APK asset URL", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            tag_name: "v1.0.7",
            html_url: "https://github.com/grendel116/nimueblue/releases/tag/v1.0.7",
            assets: [
              {
                name: "NimueBlue-1.0.7.apk",
                browser_download_url:
                  "https://github.com/grendel116/nimueblue/releases/download/v1.0.7/NimueBlue-1.0.7.apk",
              },
            ],
          }),
      } as Response),
    );

    try {
      const result = await checkAndroidVersion();
      expect(result).toEqual({
        version: "1.0.7",
        url: "https://github.com/grendel116/nimueblue/releases/download/v1.0.7/NimueBlue-1.0.7.apk",
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
