import { createStore } from "./store";

export type LibraryTab = "wishlist" | "downloads" | "artists" | "bookmarks";

// Library remembers its open tab between visits, and other screens can choose the tab it opens on
const tabStore = createStore<LibraryTab>("wishlist");

export const setLibraryTab = (tab: LibraryTab) => tabStore.set(tab);
export const useLibraryTab = () => tabStore.useStore();
