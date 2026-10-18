let sessionListenerId: string | null = null;

function generateRandomId(): string {
  // Simple UUID v4 generator without heavy external dependencies
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns an anonymous listener ID for Mirlo authorized streaming.
 * The ID lives in memory for the current app session and is never written to disk.
 */
export function getListenerUserIdSync(): string {
  sessionListenerId ??= generateRandomId();
  return sessionListenerId;
}
