import React, { useMemo } from "react";
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  FlatList,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import SearchHeader from "@/components/SearchHeader";
import DropletSpinner from "@/components/DropletSpinner";
import TagPill from "@/components/TagPill";
import { optionDisplay } from "@/components/SearchOptionRenderer";
import { useSearch, SearchCategoryFilter, Result } from "@/state/SearchContext";
import { queryTags } from "@/queries/queries";
import { GENRE_CATALOG, GenreDefinition } from "@/constants/genres";
import { theme } from "@/constants/theme";

const CATEGORY_TABS: { key: SearchCategoryFilter; label: string }[] = [
  { key: "All", label: "All" },
  { key: "Track", label: "Tracks" },
  { key: "Artist", label: "Artists" },
  { key: "Album", label: "Albums" },
  { key: "Genre", label: "Genres & Tags" },
  { key: "Radio", label: "Radio" },
  { key: "Podcast", label: "Podcasts" },
];

function matchesCategoryFilter(item: Result, filter: SearchCategoryFilter): boolean {
  if (filter === "All") return true;
  if (filter === "Track") return Boolean(item.isTrack);
  if (filter === "Artist") return Boolean(item.isArtist);
  if (filter === "Album") return Boolean(item.isTrackGroup);
  if (filter === "Genre") return Boolean(item.isGenre || item.isTag);
  if (filter === "Radio") return Boolean(item.isStation);
  if (filter === "Podcast") return Boolean(item.isPodcast);
  return true;
}

function GenreCard({ genre }: { genre: GenreDefinition }) {
  const router = useRouter();

  return (
    <Pressable
      android_ripple={{ color: theme.colors.ripple }}
      onPress={() => router.push(`/tags/${encodeURIComponent(genre.primaryTag)}` as any)}
      style={({ pressed }) => [
        styles.genreCard,
        { borderColor: genre.accentSoft },
        pressed && styles.genreCardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Explore ${genre.name} genre`}
    >
      <View
        style={[
          styles.genreIconBadge,
          { backgroundColor: genre.accentSoft, borderColor: genre.accent },
        ]}
      >
        <Ionicons name={genre.icon} size={22} color={genre.accent} />
      </View>
      <Text style={styles.genreTitle} numberOfLines={2}>
        {genre.name}
      </Text>
    </Pressable>
  );
}

export default function SearchPage() {
  const {
    showSuggestions,
    searchResults,
    searchValue,
    isSearching,
    activeCategory,
    setActiveCategory,
  } = useSearch();

  const { data: tags } = useQuery(
    queryTags({ orderBy: "count", take: 50 }),
  );
  const { top, bottom } = useSafeAreaInsets();

  const tagPills = useMemo(() => {
    return (tags?.results || []).map((tag, index) => (
      <TagPill key={`${tag.tag}-${index}`} tagName={tag.tag} />
    ));
  }, [tags]);

  const categoryCounts = useMemo(() => {
    const counts: Record<SearchCategoryFilter, number> = {
      All: searchResults.length,
      Track: 0,
      Artist: 0,
      Album: 0,
      Genre: 0,
      Radio: 0,
      Podcast: 0,
    };
    for (const item of searchResults) {
      if (item.isTrack) counts.Track++;
      else if (item.isArtist) counts.Artist++;
      else if (item.isTrackGroup) counts.Album++;
      else if (item.isGenre || item.isTag) counts.Genre++;
      else if (item.isStation) counts.Radio++;
      else if (item.isPodcast) counts.Podcast++;
    }
    return counts;
  }, [searchResults]);

  const effectiveCategory: SearchCategoryFilter =
    activeCategory !== "All" && categoryCounts[activeCategory] === 0
      ? "All"
      : activeCategory;

  const filteredResults = useMemo(() => {
    return searchResults.filter((item) =>
      matchesCategoryFilter(item, effectiveCategory),
    );
  }, [searchResults, effectiveCategory]);

  const hasActiveQuery = Boolean(searchValue.trim().length >= 2 || showSuggestions);

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: top,
          paddingBottom: bottom,
        },
      ]}
    >
      <SearchHeader />

      {!hasActiveQuery ? (
        <ScrollView
          style={styles.contentScrollView}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeader}>Browse Genres</Text>
            <Text style={styles.sectionSubheader}>
              Explore tracks, releases, and community broadcasts across genres
            </Text>
            <View style={styles.genreGrid}>
              {GENRE_CATALOG.map((genre) => (
                <GenreCard key={genre.id} genre={genre} />
              ))}
            </View>
          </View>

          {tagPills.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionHeader}>Popular Tags</Text>
              <View style={styles.tagWrap}>{tagPills}</View>
            </View>
          )}
        </ScrollView>
      ) : null}

      {hasActiveQuery && isSearching && searchResults.length === 0 ? (
        <View style={styles.centerContainer}>
          <DropletSpinner size={46} />
        </View>
      ) : null}

      {hasActiveQuery && (!isSearching || searchResults.length > 0) ? (
        <View style={styles.resultsWrapper}>
          {searchResults.length > 0 && (
            <View style={styles.filterBarContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {CATEGORY_TABS.map((tab) => {
                  const count = categoryCounts[tab.key];
                  if (tab.key !== "All" && count === 0) return null;
                  const isActive = effectiveCategory === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      onPress={() => setActiveCategory(tab.key)}
                      style={[
                        styles.filterChip,
                        isActive && styles.filterChipActive,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter by ${tab.label}`}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          isActive && styles.filterChipTextActive,
                        ]}
                      >
                        {`${tab.label} (${count})`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {filteredResults.length > 0 ? (
            <FlatList
              style={styles.resultsList}
              contentContainerStyle={styles.resultsContent}
              keyboardShouldPersistTaps="handled"
              data={filteredResults}
              keyExtractor={(item, index) => `${item.category}-${item.id}-${index}`}
              ListHeaderComponent={
                <View style={styles.resultsHeaderRow}>
                  <Text style={styles.sectionHeader}>
                    {effectiveCategory === "All"
                      ? `Top Matches (${filteredResults.length})`
                      : `${CATEGORY_TABS.find((t) => t.key === effectiveCategory)?.label || "Results"} (${filteredResults.length})`}
                  </Text>
                  {isSearching && <DropletSpinner size={20} />}
                </View>
              }
              renderItem={({ item, index }) => optionDisplay(item, index)}
            />
          ) : !isSearching ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search" size={40} color={theme.colors.textMuted} />
              <Text style={styles.emptyText}>
                {`Couldn't find anything for "${searchValue.trim()}". Try another track, artist, or genre!`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentScrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
    gap: 24,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionHeader: {
    ...theme.typography.sectionHeader,
  },
  sectionSubheader: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginBottom: 4,
  },
  genreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  genreCard: {
    width: "48.5%",
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    minHeight: 88,
    justifyContent: "space-between",
  },
  genreCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  genreIconBadge: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  genreTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
    marginBottom: 12,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  resultsWrapper: {
    flex: 1,
  },
  filterBarContainer: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceCardBorder,
    backgroundColor: theme.colors.surface,
  },
  filterScrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primarySoftStrong,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  filterChipTextActive: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  resultsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
  },
  resultsList: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  resultsContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
  },
});
