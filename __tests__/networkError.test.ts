import { isNetworkError } from "@/scripts/networkError";

describe("isNetworkError", () => {
  it("identifies standard network errors", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("Network request failed"))).toBe(true);
    expect(isNetworkError(new Error("Network Error"))).toBe(true);
    expect(isNetworkError(new Error("The Internet connection appears to be offline."))).toBe(true);
    expect(isNetworkError(new Error("Took too long"))).toBe(true);
    expect(isNetworkError(new Error("The operation was aborted"))).toBe(true);
  });

  it("handles string errors", () => {
    expect(isNetworkError("Failed to fetch")).toBe(true);
    expect(isNetworkError("Network request failed")).toBe(true);
  });

  it("returns false for non-network errors", () => {
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
    expect(isNetworkError(new Error("404 Not Found"))).toBe(false);
    expect(isNetworkError(new Error("Invalid parameters"))).toBe(false);
  });
});
