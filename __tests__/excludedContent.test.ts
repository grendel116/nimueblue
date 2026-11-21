import {
  EXCLUDED_TERMS,
  FASCIST_MOVEMENT_PATTERNS,
  MIGRATED_CURATION_PRESET,
  getCurationConfig,
  isExcludedContent,
  isExcludedCountry,
  loadMigratedCurationPreset,
  removeCustomPodcast,
  removeCustomStation,
  resetCurationConfig,
  setContentFilters,
  upsertCustomPodcast,
  upsertCustomStation,
} from "@/queries/excludedContent";

describe("client-side curation and filters", () => {
  beforeEach(() => {
    resetCurationConfig();
  });

  afterEach(() => {
    resetCurationConfig();
  });

  test("starts completely unrestricted and blank by default", () => {
    const config = getCurationConfig();
    expect(config.stations).toEqual([]);
    expect(config.podcasts).toEqual([]);
    expect(config.filters.excludedTerms).toEqual([]);
    expect(config.filters.excludedPatterns).toEqual([]);
    expect(config.filters.excludedCountries).toEqual([]);
    expect(config.filters.excludeCommercialFormatNames).toBe(false);
    expect(config.filters.radioDiscoveryTags).toEqual([]);
    expect(config.filters.podcastDiscoveryTerms).toEqual([]);

    expect(isExcludedContent(["Forbes Daily", "Top 40 Hits"])).toBe(false);
    expect(isExcludedContent(["- 0 N - 2000s on Radio"])).toBe(false);
    expect(isExcludedCountry("Israel", "IL")).toBe(false);
  });

  test("migrated preset restores fascist movement, commercial, and country filters without dropping ordinary titles", () => {
    loadMigratedCurationPreset();

    const config = getCurationConfig();
    expect(config.stations).toHaveLength(MIGRATED_CURATION_PRESET.stations.length);
    expect(config.podcasts).toHaveLength(MIGRATED_CURATION_PRESET.podcasts.length);
    expect(config.filters.excludedTerms).toEqual(EXCLUDED_TERMS);
    expect(config.filters.excludedPatterns).toEqual(FASCIST_MOVEMENT_PATTERNS);

    expect(isExcludedContent(["Christian Nationalist Radio"])).toBe(true);
    expect(isExcludedContent(["Faith Radio"], ["christian nationalism"])).toBe(true);
    expect(isExcludedContent(["White Pride Worldwide"])).toBe(true);
    expect(isExcludedContent(["Neo-Nazi Hour"])).toBe(true);
    expect(isExcludedContent(["National Socialist Radio"])).toBe(true);
    expect(isExcludedContent(["Alt-Right Talk"])).toBe(true);
    expect(isExcludedContent(["Patriot Radio Network"])).toBe(true);
    expect(isExcludedContent(["American Patriots Live"])).toBe(true);
    expect(isExcludedContent(["Make America Great Radio"])).toBe(true);
    expect(isExcludedContent(["MAGA Morning"])).toBe(true);
    expect(isExcludedContent(["The Alex Jones Show"])).toBe(true);
    expect(isExcludedContent(["Infowars"])).toBe(true);
    expect(isExcludedContent(["Newsmax Radio"])).toBe(true);

    expect(isExcludedContent(["Anti-Nazi Radio"])).toBe(false);
    expect(isExcludedContent(["Antifascist Broadcast"])).toBe(false);
    expect(isExcludedContent(["Americana Roots Radio"])).toBe(false);
    expect(isExcludedContent(["Latin America Libre"])).toBe(false);
    expect(isExcludedContent(["Native America Calling"])).toBe(false);
    expect(isExcludedContent(["Radio Free America"])).toBe(false);
    expect(isExcludedContent(["Christian Gospel Hour"], ["christian", "gospel"])).toBe(false);

    expect(isExcludedCountry("Morocco", "MA")).toBe(true);
    expect(isExcludedCountry("Thailand", "TH")).toBe(false);
  });

  test("applies custom user filter terms and safely ignores invalid regex patterns", () => {
    setContentFilters({
      excludedTerms: ["ads", "corporate"],
      excludedPatterns: ["[invalid-regex", "promo[-\\s]?hour"],
      excludedCountries: ["zz"],
    });

    expect(isExcludedContent(["No Ads Here"])).toBe(true);
    expect(isExcludedContent(["Corporate Radio"])).toBe(true);
    expect(isExcludedContent(["Promo Hour Live"])).toBe(true);
    expect(isExcludedContent(["Community Music"])).toBe(false);
    expect(isExcludedCountry("Nowhere", "ZZ")).toBe(true);
  });

  test("adds and removes custom stations and custom podcasts client-side", () => {
    const station = upsertCustomStation({
      name: "My Pirate FM",
      streamUrl: "https://example.com/stream.mp3",
      location: "Oakland",
      tags: ["diy", "punk"],
    });
    const podcast = upsertCustomPodcast({
      name: "Local Organizing Pod",
      feedUrl: "https://example.com/feed.xml",
      author: "Neighborhood Union",
    });

    expect(getCurationConfig().stations.map((s) => s.id)).toEqual([station.id]);
    expect(getCurationConfig().podcasts.map((p) => p.id)).toEqual([podcast.id]);

    removeCustomStation(station.id);
    removeCustomPodcast(podcast.id);
    expect(getCurationConfig().stations).toEqual([]);
    expect(getCurationConfig().podcasts).toEqual([]);
  });
});
