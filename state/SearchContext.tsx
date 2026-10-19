import { useState, createContext, useContext } from "react";
import * as api from "../queries/fetch/fetchWrapper";
import { searchFairplayerAlbums } from "@/queries/fairplayer";
import { searchRadioStations, RadioStation } from "@/queries/radio";
import { searchPodcastShows, PodcastShow } from "@/queries/podcast";

// Albums carrying every tag that matches the search, so "disco" also finds releases
// tagged disco, nu-disco, italo-disco, disco-house and the rest
const ALBUMS_PER_TAG = 8;

async function fetchTaggedAlbums(term: string): Promise<AlbumProps[]> {
  const tags = await api.getMany<Tag>(`/v1/tags`, {}, { tag: term, orderBy: "count" });
  const pages = await Promise.all(
    tags.results.map((tag) =>
      api.getMany<AlbumProps>(`/v1/trackGroups`, {}, { tag: tag.tag, take: String(ALBUMS_PER_TAG) }),
    ),
  );
  return pages.flatMap((page) => page.results);
}

type SearchContextType = {
  isSearching: boolean;
  setIsSearching: (searchStatus: boolean) => void;

  getOptions: (val: string) => Promise<Result[]> | Result[] | undefined;
  onSelect?: (
    value:
      | string
      | number
      | {
          id: string | number;
          name: string;
          isNew?: boolean;
        },
  ) => void;
  searchResults: Result[];
  setSearchResults: (results: Result[]) => void;
  showSuggestions: boolean;
  setShowSuggestions: (show: boolean) => void;
  searchValue: string;
  setSearchValue: (val: string) => void;
};

export type Result = {
  id: number | string;
  name: string;
  category?: string;
  artistId?: number | string;
  trackGroupId?: number | string;
  artistName?: string;
  imageUrl?: string;
  isStation?: boolean;
  isPodcast?: boolean;
  isTrack?: boolean;
  isTrackGroup?: boolean;
  isArtist?: boolean;
  firstInCategory?: boolean;
  avatar?: {
    url: string;
    sizes?: { [key: string]: string };
    updatedAt: string;
  };
  trackGroupCover?: {
    sizes: {
      60: string;
      120: string;
      300: string;
      600: string;
      960: string;
      1200: string;
      1500: string;
    };
  };
};

export const SearchContext = createContext<SearchContextType | null>(null);

export const SearchContextProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Result[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [searchValue, setSeachValue] = useState<string>("");

  async function getOptions(searchString: string) {
    const term = searchString.trim();
    const [artists, trackGroups, tracks, taggedAlbums, fairplayerAlbums, radioStations, podcastShows] =
      await Promise.all([
        api.getMany<Artist>(`/v1/artists`, {}, { name: term }),
        api.getMany<AlbumProps>(`/v1/trackGroups`, {}, { title: term }),
        api.getMany<RNTrack>(`/v1/tracks`, {}, { title: term }),
        fetchTaggedAlbums(term),
        searchFairplayerAlbums(term).catch((error) => {
          console.warn("Fairplayer catalog search failed:", error);
          return [] as AlbumProps[];
        }),
        searchRadioStations(term).catch((error) => {
          console.warn("Radio search failed:", error);
          return [] as RadioStation[];
        }),
        searchPodcastShows(term).catch((error) => {
          console.warn("Podcast search failed:", error);
          return [] as PodcastShow[];
        }),
      ]);

    const seenAlbums = new Set<string>();
    const mirloAlbums = [...trackGroups.results, ...taggedAlbums].filter((album) => {
      const key = String(album.id);
      if (seenAlbums.has(key)) return false;
      seenAlbums.add(key);
      return true;
    });

    const results = [
      ...artists.results.map((r, rid) => ({
        firstInCategory: rid === 0,
        category: "Artist",
        artistId: r.urlSlug ?? r.id,
        id: r.id,
        avatar: r.avatar,
        name: r.name,
        isArtist: true,
      })),
      ...mirloAlbums.map((tr, trid) => ({
        firstInCategory: trid === 0,
        category: "Album",
        id: tr.urlSlug ?? tr.id,
        artistId: tr.artist?.urlSlug ?? tr.artistId,
        artistName: tr.artist.name,
        trackGroupId: tr.urlSlug ?? tr.id,
        trackGroupCover: tr.cover,
        name: tr.title,
        isTrackGroup: true,
      })),
      ...tracks.results.map((tr, trid) => ({
        firstInCategory: trid === 0,
        id: tr.id,
        category: "Track",
        trackGroupId: tr.trackGroup.urlSlug ?? tr.trackGroupId,
        artistId: tr.trackGroup.artist.urlSlug ?? tr.trackGroup.artistId,
        artistName: tr.trackGroup.artist.name,
        trackGroupCover: tr.trackGroup.cover,
        name: tr.title,
        isTrack: true,
      })),
      ...fairplayerAlbums.map((album) => ({
        category: "Album",
        id: album.urlSlug,
        artistId: album.artist.urlSlug,
        artistName: album.artist.name,
        trackGroupId: album.urlSlug,
        trackGroupCover: album.cover,
        name: album.title,
        isTrackGroup: true,
      })),
      ...radioStations.map((station, sid) => ({
        firstInCategory: sid === 0,
        category: "Radio",
        id: station.id,
        name: station.name,
        artistName: station.location,
        imageUrl: station.artwork,
        isStation: true,
      })),
      ...podcastShows.map((podcast, pid) => ({
        firstInCategory: pid === 0,
        category: "Podcast",
        id: podcast.id,
        name: podcast.name,
        artistName: podcast.author,
        imageUrl: podcast.artwork,
        isPodcast: true,
      })),
    ];

    return results;
  }

  const value: SearchContextType = {
    isSearching: isSearching,
    setIsSearching: setIsSearching,
    getOptions: getOptions,
    searchResults: searchResults,
    setSearchResults: setSearchResults,
    showSuggestions: showSuggestions,
    setShowSuggestions: setShowSuggestions,
    searchValue: searchValue,
    setSearchValue: setSeachValue,
  };

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
};

export function useSearch(): SearchContextType {
  const context = useContext(SearchContext);

  if (!context) {
    throw new Error("useSearch must be used within a SearchContext Provider");
  }

  return context;
}
