import React, { useState, createContext, useContext, useEffect, useRef, useCallback } from "react";
import * as api from "../queries/fetch/fetchWrapper";
import {
  searchFairplayerAlbums,
  searchFairplayerCatalog,
  FairplayerCatalogSearchResult,
} from "@/queries/fairplayer";
import { searchRadioStations, RadioStation } from "@/queries/radio";
import { searchPodcastShows, PodcastShow } from "@/queries/podcast";
import { fetchFederatedChorusAlbums, resolveFeedSourceName } from "@/queries/chorus";
import {
  GENRE_CATALOG,
  GenreDefinition,
  findGenreByTag,
  matchGenres,
} from "@/constants/genres";
import {
  getDownloadedTracks,
  groupTracksIntoAlbums,
  savedAlbumSlug,
  SAVED_SOURCE,
} from "@/scripts/downloadManager";

const ALBUMS_PER_TAG = 14;
const MAX_TAG_FANOUT = 8;

export type SearchCategoryFilter =
  | "All"
  | "Album"
  | "Artist"
  | "Genre"
  | "Radio"
  | "Podcast";

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
  isTrackGroup?: boolean;
  isArtist?: boolean;
  isGenre?: boolean;
  isTag?: boolean;
  tagSlug?: string;
  subtitle?: string;
  accent?: string;
  icon?: string;
  tags?: string[];
  matchedGenre?: string;
  matchedTag?: string;
  source?: string;
  firstInCategory?: boolean;
  score?: number;
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

type SearchContextType = {
  isSearching: boolean;
  setIsSearching: (searchStatus: boolean) => void;
  getOptions: (val: string, signal?: AbortSignal) => Promise<Result[]>;
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
  activeCategory: SearchCategoryFilter;
  setActiveCategory: (cat: SearchCategoryFilter) => void;
  clearSearch: () => void;
};

function normalizeSearchText(text?: string | number | null): string {
  if (text === undefined || text === null) return "";
  return String(text)
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Computes how accurately `candidate` matches `rawQuery` on a [0, 1] scale.
 * Exact > Word-Prefix > Prefix > Whole-Word > All-Words > Substring > Multi-Token.
 */
export function getFieldMatchStrength(
  candidate: string | undefined,
  rawQuery: string,
  queryTokens: string[],
): number {
  if (!candidate || !rawQuery) return 0;
  const normCandidate = normalizeSearchText(candidate);
  const normQuery = normalizeSearchText(rawQuery);
  if (!normCandidate || !normQuery) return 0;

  if (normCandidate === normQuery) return 1.0;

  if (
    normCandidate.startsWith(`${normQuery} `) ||
    normCandidate.startsWith(`${normQuery}:`)
  ) {
    return 0.94;
  }

  if (normCandidate.startsWith(normQuery)) {
    return 0.88;
  }

  const wordBoundaryRegex = new RegExp(
    `(?:^|\\s|\\(|\\[|/)${escapeRegExp(normQuery)}(?:$|\\s|\\)|\\]|/|[:,.])`,
    "i",
  );
  if (
    wordBoundaryRegex.test(normCandidate) ||
    (/[^\x00-\x7F]/.test(normQuery) && normCandidate.includes(normQuery))
  ) {
    return 0.82;
  }

  if (
    queryTokens.length > 1 &&
    queryTokens.every((tok) => {
      const tokRegex = new RegExp(`(?:^|\\s)${escapeRegExp(tok)}(?:$|\\s)`, "i");
      return tokRegex.test(normCandidate);
    })
  ) {
    return 0.76;
  }

  if (normCandidate.includes(normQuery)) {
    return 0.68;
  }

  if (queryTokens.length > 1) {
    const matchedCount = queryTokens.filter((tok) => normCandidate.includes(tok)).length;
    if (matchedCount === queryTokens.length) {
      return 0.58;
    }
    if (matchedCount > 0 && matchedCount / queryTokens.length >= 0.5) {
      return 0.35 * (matchedCount / queryTokens.length);
    }
  }

  return 0;
}

/**
 * Scores a search result according to the strict accuracy hierarchy:
 *   Tier 1 (4000+): Album Title accuracy
 *   Tier 2 (3000+): Artist Name accuracy (plus direct Station/Show title matches)
 *   Tier 3 (2000+): Genre accuracy
 *   Tier 4 (1000+): Tag accuracy
 * Within each tier, higher string match strength (exact > prefix > word > substring) wins.
 */
export function scoreSearchResult(result: Result, query: string): number {
  const cleanQuery = normalizeSearchText(query);
  if (!cleanQuery) return 0;
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);

  const nameStrength = getFieldMatchStrength(result.name, cleanQuery, tokens);
  const artistStrength = result.isArtist
    ? nameStrength
    : getFieldMatchStrength(result.artistName, cleanQuery, tokens);

  const genreCandidates = [
    result.isGenre ? result.name : undefined,
    result.isGenre ? result.tagSlug : undefined,
    result.matchedGenre,
  ].filter(Boolean) as string[];
  const genreStrength = genreCandidates.reduce(
    (max, g) => Math.max(max, getFieldMatchStrength(g, cleanQuery, tokens)),
    0,
  );

  const tagCandidates = [
    result.isTag ? result.tagSlug || result.name : undefined,
    result.matchedTag,
    ...(result.tags || []),
  ].filter(Boolean) as string[];
  const tagStrength = tagCandidates.reduce(
    (max, t) => Math.max(max, getFieldMatchStrength(t, cleanQuery, tokens)),
    0,
  );

  const lengthDelta = Math.min(40, Math.abs((result.name?.length || 0) - cleanQuery.length));
  const concisenessBonus = Math.max(0, 20 - lengthDelta * 0.5);

  let bestScore = 0;

  // 1. ALBUM TITLE MATCH (4000 - 4999)
  if (result.isTrackGroup) {
    let effectiveAlbumStrength = nameStrength;
    if (tokens.length > 1 && result.artistName) {
      const combined = `${result.name} ${result.artistName}`;
      const combinedStrength = getFieldMatchStrength(combined, cleanQuery, tokens);
      const hasAlbumToken = tokens.some((tok) =>
        normalizeSearchText(result.name).includes(tok),
      );
      if (hasAlbumToken && combinedStrength > effectiveAlbumStrength) {
        effectiveAlbumStrength = combinedStrength;
      }
    }

    if (effectiveAlbumStrength > 0) {
      const albumScore =
        4000 +
        effectiveAlbumStrength * 800 +
        artistStrength * 120 +
        concisenessBonus;
      bestScore = Math.max(bestScore, albumScore);
    }
  }

  // 2. ARTIST NAME MATCH (3000 - 3999)
  if (artistStrength > 0) {
    const entityOrderBonus = result.isArtist
      ? 140
      : result.isTrackGroup
        ? 115
        : 50;
    const artistScore =
      3000 + artistStrength * 800 + entityOrderBonus + concisenessBonus * 0.5;
    bestScore = Math.max(bestScore, artistScore);
  }

  // Direct Station / Podcast title match when not already higher
  if ((result.isStation || result.isPodcast) && nameStrength > 0) {
    const stationShowScore =
      2600 + nameStrength * 750 + artistStrength * 80 + 40 + concisenessBonus * 0.5;
    bestScore = Math.max(bestScore, stationShowScore);
  }

  // 3. GENRE MATCH (2000 - 2599)
  if (genreStrength > 0 || result.isGenre) {
    const effectiveGenre = Math.max(genreStrength, result.isGenre ? 0.65 : 0);
    const genreEntityBonus = result.isGenre
      ? 130
      : result.isTrackGroup
        ? 95
        : 40;
    const genreScore = 2000 + effectiveGenre * 450 + genreEntityBonus;
    bestScore = Math.max(bestScore, genreScore);
  }

  // 4. TAG MATCH (1000 - 1999)
  if (tagStrength > 0 || result.isTag) {
    const effectiveTag = Math.max(tagStrength, result.isTag ? 0.65 : 0);
    const tagEntityBonus = result.isTag
      ? 130
      : result.isTrackGroup
        ? 95
        : 40;
    const tagScore = 1000 + effectiveTag * 450 + tagEntityBonus;
    bestScore = Math.max(bestScore, tagScore);
  }

  // Fallback for items returned by upstream search (e.g. track match, description, or partial match)
  if (bestScore === 0) {
    const fallbackTypeBonus = result.isTrackGroup
      ? 400
      : result.isArtist
        ? 300
        : result.isGenre
          ? 250
          : result.isTag
            ? 200
            : 100;
    bestScore = fallbackTypeBonus + concisenessBonus;
  }

  return bestScore;
}

export function sortResultsByAccuracy(results: Result[], query: string): Result[] {
  const scored = results.map((item) => ({
    ...item,
    score: scoreSearchResult(item, query),
  }));

  scored.sort((a, b) => {
    const diff = (b.score ?? 0) - (a.score ?? 0);
    if (Math.abs(diff) > 0.01) return diff;
    return (a.name || "").localeCompare(b.name || "");
  });

  const seenCategories = new Set<string>();
  return scored.map((item) => {
    const cat = item.category || "Other";
    const first = !seenCategories.has(cat);
    if (first) seenCategories.add(cat);
    return {
      ...item,
      firstInCategory: first,
    };
  });
}

type TaggedLookupResult = {
  tags: string[];
  albums: { album: AlbumProps; matchedTag: string; matchedGenre?: string }[];
};

async function fetchTaggedReleasesAndTags(
  term: string,
  matchedGenres: GenreDefinition[],
  signal?: AbortSignal,
): Promise<TaggedLookupResult> {
  let apiTags: Tag[] = [];
  try {
    const tagRes = await api.getMany<Tag>(
      `/v1/tags`,
      { signal },
      { tag: term, orderBy: "count", take: "25" },
    );
    apiTags = tagRes.results || [];
  } catch {
    apiTags = [];
  }

  const tagToGenre = new Map<string, string>();
  const tagsToFetch: string[] = [];
  const seenTagNames = new Set<string>();

  for (const g of matchedGenres) {
    for (const gt of [g.primaryTag, ...g.tags.slice(0, 3)]) {
      const clean = gt.toLowerCase().trim();
      tagToGenre.set(clean, g.name);
      if (!seenTagNames.has(clean)) {
        seenTagNames.add(clean);
        tagsToFetch.push(clean);
      }
    }
  }

  for (const t of apiTags) {
    const clean = (t.tag || "").toLowerCase().trim();
    if (!clean) continue;
    const g = findGenreByTag(clean);
    if (g && !tagToGenre.has(clean)) {
      tagToGenre.set(clean, g.name);
    }
    if (!seenTagNames.has(clean)) {
      seenTagNames.add(clean);
      tagsToFetch.push(clean);
    }
  }

  const fanoutTags = tagsToFetch.slice(0, MAX_TAG_FANOUT);
  const pages = await Promise.allSettled(
    fanoutTags.map(async (tagName) => {
      const res = await api.getMany<AlbumProps>(
        `/v1/trackGroups`,
        { signal },
        { tag: tagName, take: String(ALBUMS_PER_TAG) },
      );
      return {
        tagName,
        genreName: tagToGenre.get(tagName),
        results: res.results || [],
      };
    }),
  );

  const albums: { album: AlbumProps; matchedTag: string; matchedGenre?: string }[] = [];
  for (const page of pages) {
    if (page.status === "fulfilled") {
      for (const album of page.value.results) {
        albums.push({
          album,
          matchedTag: page.value.tagName,
          matchedGenre: page.value.genreName,
        });
      }
    }
  }

  return {
    tags: apiTags.map((t) => t.tag).filter(Boolean),
    albums,
  };
}

export const SearchContext = createContext<SearchContextType | null>(null);

export const SearchContextProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Result[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [searchValue, setSearchValueState] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<SearchCategoryFilter>("All");

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastCompletedQueryRef = useRef<string>("");

  const clearSearch = useCallback(() => {
    abortControllerRef.current?.abort();
    lastCompletedQueryRef.current = "";
    setSearchValueState("");
    setSearchResults([]);
    setShowSuggestions(false);
    setIsSearching(false);
    setActiveCategory("All");
  }, []);

  const getOptions = useCallback(
    async (searchString: string, signal?: AbortSignal): Promise<Result[]> => {
      const term = searchString.trim();
      if (!term || (term.length < 2 && /^[\x00-\x7F]*$/.test(term))) return [];
      const lowerTerm = term.toLowerCase().replace(/^#/, "");
      const queryTokens = lowerTerm.split(/[\s,/-]+/).filter(Boolean);

      const matchedGenres = matchGenres(term);

      const [
        artistsSettled,
        trackGroupsSettled,
        tracksSettled,
        taggedSettled,
        chorusSettled,
        fairplayerSettled,
        radioSettled,
        podcastSettled,
        downloadsSettled,
      ] = await Promise.allSettled([
        api.getMany<Artist>(`/v1/artists`, { signal }, { name: term, take: "30" }),
        api.getMany<AlbumProps>(`/v1/trackGroups`, { signal }, { title: term, take: "40" }),
        api.getMany<RNTrack>(`/v1/tracks`, { signal }, { title: term, take: "50" }),
        fetchTaggedReleasesAndTags(term, matchedGenres, signal),
        fetchFederatedChorusAlbums({ take: 80 }, signal),
        searchFairplayerCatalog(term, signal).catch(async () => {
          const fallbackAlbums = await searchFairplayerAlbums(term, signal).catch(
            () => [] as AlbumProps[],
          );
          return {
            albums: fallbackAlbums,
            artists: [],
            tracks: [],
          } as FairplayerCatalogSearchResult;
        }),
        searchRadioStations(term, signal),
        searchPodcastShows(term, signal),
        getDownloadedTracks(),
      ]);

      const artists =
        artistsSettled.status === "fulfilled" ? artistsSettled.value.results || [] : [];
      const trackGroups =
        trackGroupsSettled.status === "fulfilled"
          ? trackGroupsSettled.value.results || []
          : [];
      const directTracks =
        tracksSettled.status === "fulfilled" ? tracksSettled.value.results || [] : [];
      const taggedData: TaggedLookupResult =
        taggedSettled.status === "fulfilled"
          ? taggedSettled.value
          : { tags: [], albums: [] };
      const chorusAlbums =
        chorusSettled.status === "fulfilled" ? chorusSettled.value || [] : [];
      const fairplayerData: FairplayerCatalogSearchResult =
        fairplayerSettled.status === "fulfilled"
          ? fairplayerSettled.value
          : { albums: [], artists: [], tracks: [] };
      const radioStations =
        radioSettled.status === "fulfilled" ? radioSettled.value || [] : [];
      const podcastShows =
        podcastSettled.status === "fulfilled" ? podcastSettled.value || [] : [];
      const downloadedTracks =
        downloadsSettled.status === "fulfilled" ? downloadsSettled.value || [] : [];

      const results: Result[] = [];
      const albumMap = new Map<string, Result>();
      const artistMap = new Map<string, Result>();
      const tagSet = new Set<string>();

      const upsertAlbum = (candidate: Result) => {
        const cleanName = typeof candidate.name === "string" ? candidate.name.trim() : "";
        const normName = normalizeSearchText(cleanName);
        if (!normName) return;
        candidate.name = cleanName;
        const key = `${normalizeSearchText(candidate.artistName)}:${normName}`;
        const existing = albumMap.get(key);
        if (!existing) {
          albumMap.set(key, candidate);
          return;
        }
        if (!existing.matchedGenre && candidate.matchedGenre) {
          existing.matchedGenre = candidate.matchedGenre;
        }
        if (!existing.matchedTag && candidate.matchedTag) {
          existing.matchedTag = candidate.matchedTag;
        }
        if (candidate.tags?.length) {
          existing.tags = Array.from(new Set([...(existing.tags || []), ...candidate.tags]));
        }
      };

      const upsertArtist = (candidate: Result) => {
        const cleanName = typeof candidate.name === "string" ? candidate.name.trim() : "";
        const key = normalizeSearchText(cleanName);
        if (!key) return;
        candidate.name = cleanName;
        if (!artistMap.has(key)) {
          artistMap.set(key, candidate);
        }
      };

      // 1. Curated Genres matching the query
      for (const genre of matchedGenres) {
        tagSet.add(genre.primaryTag.toLowerCase());
        results.push({
          id: `genre-${genre.id}`,
          name: genre.name,
          subtitle: genre.subtitle,
          category: "Genre",
          isGenre: true,
          tagSlug: genre.primaryTag,
          accent: genre.accent,
          icon: genre.icon,
          tags: genre.tags,
          matchedGenre: genre.name,
        });
      }

      // 2. Matching Tags from Mirlo
      for (const rawTag of taggedData.tags) {
        const cleanTag = rawTag.toLowerCase().trim();
        if (!cleanTag || tagSet.has(cleanTag)) continue;
        tagSet.add(cleanTag);
        const parentGenre = findGenreByTag(cleanTag);
        results.push({
          id: `tag-${cleanTag}`,
          name: `#${cleanTag}`,
          subtitle: parentGenre ? `${parentGenre.name} · Community Tag` : "Community Tag",
          category: "Tag",
          isTag: true,
          tagSlug: cleanTag,
          matchedTag: cleanTag,
          matchedGenre: parentGenre?.name,
        });
      }

      // 3. Albums surfaced from Direct Mirlo Track Matches
      for (const tr of directTracks) {
        const tg = tr?.trackGroup;
        if (!tg) continue;
        const artistSlug = tg.artist?.urlSlug ?? tg.artistId;
        const artistName = tg.artist?.name || "";
        upsertAlbum({
          id: tg.urlSlug ?? tg.id,
          trackGroupId: tg.urlSlug ?? tg.id,
          artistId: artistSlug,
          artistName,
          trackGroupCover: tg.cover,
          name: tg.title,
          category: "Album",
          isTrackGroup: true,
          source: "Mirlo",
        });
      }

      // 4. Mirlo Artists (and any embedded trackGroups)
      for (const artist of artists) {
        upsertArtist({
          id: artist.id,
          artistId: artist.urlSlug ?? artist.id,
          name: artist.name,
          category: "Artist",
          isArtist: true,
          avatar: artist.avatar,
          source: "Mirlo",
        });

        for (const tg of artist.trackGroups || []) {
          const albumArtistName = tg.artist?.name || artist.name;
          const albumArtistSlug = tg.artist?.urlSlug ?? artist.urlSlug ?? artist.id;
          upsertAlbum({
            id: tg.urlSlug ?? tg.id,
            trackGroupId: tg.urlSlug ?? tg.id,
            artistId: albumArtistSlug,
            artistName: albumArtistName,
            trackGroupCover: tg.cover,
            name: tg.title,
            category: "Album",
            isTrackGroup: true,
            tags: tg.tags,
            source: "Mirlo",
          });
        }
      }

      // 5. Mirlo Direct Albums
      for (const tg of trackGroups) {
        const artistSlug = tg.artist?.urlSlug ?? tg.artistId;
        const artistName = tg.artist?.name || "";
        upsertAlbum({
          id: tg.urlSlug ?? tg.id,
          trackGroupId: tg.urlSlug ?? tg.id,
          artistId: artistSlug,
          artistName,
          trackGroupCover: tg.cover,
          name: tg.title,
          category: "Album",
          isTrackGroup: true,
          tags: tg.tags,
          source: "Mirlo",
        });
      }

      // 6. Mirlo Tagged Albums
      for (const { album: tg, matchedTag, matchedGenre } of taggedData.albums) {
        const artistSlug = tg.artist?.urlSlug ?? tg.artistId;
        const artistName = tg.artist?.name || "";
        upsertAlbum({
          id: tg.urlSlug ?? tg.id,
          trackGroupId: tg.urlSlug ?? tg.id,
          artistId: artistSlug,
          artistName,
          trackGroupCover: tg.cover,
          name: tg.title,
          category: "Album",
          isTrackGroup: true,
          tags: tg.tags || [matchedTag],
          matchedTag,
          matchedGenre,
          source: "Mirlo",
        });
      }

      // 7. Federated Chorus Catalog (Artists, Albums, Tags)
      for (const album of chorusAlbums) {
        const artistName = album.artist?.name || "";
        const artistSlug = album.artist?.urlSlug || album.artistId;
        const albumTags = album.tags || [];
        const matchedTag = albumTags.find(
          (t) =>
            getFieldMatchStrength(t, lowerTerm, queryTokens) > 0 ||
            matchedGenres.some((g) => g.tags.includes(t.toLowerCase())),
        );
        const matchedGenreObj =
          (matchedTag ? findGenreByTag(matchedTag) : undefined) ||
          matchedGenres.find((g) => albumTags.some((t) => g.tags.includes(t.toLowerCase())));
        const artistMatch = getFieldMatchStrength(artistName, lowerTerm, queryTokens) > 0;
        const albumTitleMatch = getFieldMatchStrength(album.title, lowerTerm, queryTokens) > 0;
        const trackMatch = (album.tracks || []).some(
          (tr) => getFieldMatchStrength(tr.title, lowerTerm, queryTokens) > 0,
        );

        for (const t of albumTags) {
          const cleanT = t.toLowerCase().trim();
          if (
            cleanT &&
            !tagSet.has(cleanT) &&
            getFieldMatchStrength(cleanT, lowerTerm, queryTokens) > 0
          ) {
            tagSet.add(cleanT);
            const g = findGenreByTag(cleanT);
            results.push({
              id: `tag-${cleanT}`,
              name: `#${cleanT}`,
              subtitle: g ? `${g.name} · Tag` : "Community Tag",
              category: "Tag",
              isTag: true,
              tagSlug: cleanT,
              matchedTag: cleanT,
              matchedGenre: g?.name,
            });
          }
        }

        if (artistMatch) {
          upsertArtist({
            id: album.artistId,
            artistId: artistSlug,
            name: artistName,
            category: "Artist",
            isArtist: true,
            trackGroupCover: album.cover,
            source: album.source || resolveFeedSourceName(album.sourceUrl),
          });
        }

        if (albumTitleMatch || artistMatch || matchedTag || matchedGenreObj || trackMatch) {
          upsertAlbum({
            id: album.urlSlug || album.id,
            trackGroupId: album.urlSlug || album.id,
            artistId: artistSlug,
            artistName,
            trackGroupCover: album.cover,
            name: album.title,
            category: "Album",
            isTrackGroup: true,
            tags: albumTags,
            matchedTag,
            matchedGenre: matchedGenreObj?.name,
            source: album.source || resolveFeedSourceName(album.sourceUrl),
          });
        }
      }

      // 8. Faircamp / Fairplayer Catalog (Artists, Albums)
      for (const fairArtist of fairplayerData.artists) {
        upsertArtist({
          id: fairArtist.id,
          artistId: fairArtist.urlSlug,
          name: fairArtist.name,
          category: "Artist",
          isArtist: true,
          imageUrl: fairArtist.avatarUrl,
          source: "Faircamp",
        });
      }

      for (const fairAlbum of fairplayerData.albums) {
        upsertAlbum({
          id: fairAlbum.urlSlug,
          trackGroupId: fairAlbum.urlSlug,
          artistId: fairAlbum.artist.urlSlug,
          artistName: fairAlbum.artist.name,
          trackGroupCover: fairAlbum.cover,
          name: fairAlbum.title,
          category: "Album",
          isTrackGroup: true,
          matchedGenre: matchedGenres[0]?.name,
          source: "Faircamp",
        });
      }

      // 9. Local Saved / Downloaded Music
      if (downloadedTracks.length > 0) {
        const savedAlbums = groupTracksIntoAlbums(downloadedTracks);
        for (const savedAlbum of savedAlbums) {
          const slug = savedAlbumSlug(savedAlbum.key);
          const albumMatch =
            getFieldMatchStrength(savedAlbum.title, lowerTerm, queryTokens) > 0;
          const artistMatch =
            getFieldMatchStrength(savedAlbum.artist, lowerTerm, queryTokens) > 0;
          const trackMatch = savedAlbum.tracks.some(
            (dt) => getFieldMatchStrength(dt.title, lowerTerm, queryTokens) > 0,
          );

          if (albumMatch || artistMatch || trackMatch) {
            upsertAlbum({
              id: slug,
              trackGroupId: slug,
              artistId: slug,
              artistName: savedAlbum.artist,
              imageUrl: savedAlbum.artwork,
              name: savedAlbum.title,
              category: "Album",
              isTrackGroup: true,
              source: SAVED_SOURCE,
            });
          }
        }
      }

      // 10. Radio Stations & Podcasts
      for (const station of radioStations) {
        results.push({
          id: station.id,
          name: station.name,
          artistName: station.location,
          imageUrl: station.artwork,
          category: "Radio",
          isStation: true,
          tags: station.tags,
          matchedGenre: matchedGenres[0]?.name,
        });
      }

      for (const podcast of podcastShows) {
        results.push({
          id: podcast.id,
          name: podcast.name,
          artistName: podcast.author,
          imageUrl: podcast.artwork,
          category: "Podcast",
          isPodcast: true,
        });
      }

      results.push(
        ...artistMap.values(),
        ...albumMap.values(),
      );

      return sortResultsByAccuracy(results, term);
    },
    [],
  );

  // Manage debounced search inside the root provider so navigating into a result
  // and coming back via Back never re-runs the query or clears results.
  useEffect(() => {
    const trimmed = searchValue.trim();

    if (!trimmed || (trimmed.length < 2 && /^[\x00-\x7F]*$/.test(trimmed))) {
      abortControllerRef.current?.abort();
      lastCompletedQueryRef.current = "";
      setSearchResults([]);
      setShowSuggestions(false);
      setIsSearching(false);
      return;
    }

    if (trimmed === lastCompletedQueryRef.current) {
      setShowSuggestions(true);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setShowSuggestions(true);
      setIsSearching(true);

      try {
        const nextResults = await getOptions(trimmed, controller.signal);
        if (!controller.signal.aborted) {
          lastCompletedQueryRef.current = trimmed;
          setSearchResults(nextResults);
          setIsSearching(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 220);

    return () => {
      clearTimeout(timer);
    };
  }, [searchValue, getOptions]);

  const setSearchValue = useCallback((val: string) => {
    setSearchValueState(val);
  }, []);

  const value: SearchContextType = {
    isSearching,
    setIsSearching,
    getOptions,
    searchResults,
    setSearchResults,
    showSuggestions,
    setShowSuggestions,
    searchValue,
    setSearchValue,
    activeCategory,
    setActiveCategory,
    clearSearch,
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
