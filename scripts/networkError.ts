// Detects network connectivity failures and offline errors
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  const msg = (
    error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error)
  ).toLowerCase();

  return (
    msg.includes("failed to fetch") ||
    msg.includes("network request failed") ||
    msg.includes("network error") ||
    msg.includes("networkerror") ||
    msg.includes("offline") ||
    msg.includes("the internet connection appears to be offline") ||
    msg.includes("aborted") ||
    msg.includes("abort error") ||
    msg.includes("load failed") ||
    msg.includes("timeout") ||
    msg.includes("took too long")
  );
}
