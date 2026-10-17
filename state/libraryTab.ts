import { useEffect, useState } from "react";

export type LibraryTab = "wishlist" | "downloads" | "artists" | "bookmarks";

// Library remembers its open tab between visits, and other screens can choose the tab it opens on
let currentLibraryTab: LibraryTab = "wishlist";
const listeners = new Set<() => void>();

export function setLibraryTab(tab: LibraryTab) {
  if (currentLibraryTab === tab) return;
  currentLibraryTab = tab;
  listeners.forEach((listener) => listener());
}

export function useLibraryTab(): LibraryTab {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return currentLibraryTab;
}
