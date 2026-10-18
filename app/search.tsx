import { debounce } from "lodash";
import SearchHeader from "@/components/SearchHeader";
import DropletSpinner from "@/components/DropletSpinner";
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Pressable,
} from "react-native";
import { useSearch } from "@/state/SearchContext";
import { useEffect, useMemo, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { queryTags } from "@/queries/queries";
import TagPill from "@/components/TagPill";
import { optionDisplay } from "@/components/SearchOptionRenderer";
import { useRouter } from "expo-router";
import { theme } from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";

export default function SearchPage() {
  const {
    showSuggestions,
    setShowSuggestions,
    searchResults,
    setIsSearching,
    getOptions,
    setSearchResults,
    searchValue,
    isSearching,
  } = useSearch();
  const { data: tags, isPending } = useQuery(
    queryTags({ orderBy: "count", take: 25 }),
  );
  const { top, bottom } = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation("translation");
  const tagPills = useMemo(() => {
    return tags?.results.map((tag, index) => (
      <TagPill key={index} tagName={tag.tag} />
    ));
  }, [tags]);

  const searchCallbackRef = useRef(
    debounce(async (searchString) => {
      if (searchString && searchString.length > 1) {
        setShowSuggestions(true);
        setIsSearching(true);
        const results = await getOptions(searchString);

        setSearchResults(results ?? []);
        setIsSearching(false);
      } else {
        setSearchResults([]);
        setShowSuggestions(false);
      }
    }, 500),
  ).current;

  useEffect(() => {
    searchCallbackRef(searchValue);
  }, [searchValue]);

  if (isPending) {
    return (
      <View
        style={[
          styles.container,
          {
            paddingTop: top,
            paddingBottom: bottom,
            justifyContent: "space-between",
          },
        ]}
      >
        <SearchHeader />
        <View style={styles.centerContainer}>
          <DropletSpinner size={46} />
        </View>
      </View>
    );
  }

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
      {!isSearching && !showSuggestions && !searchValue && !searchResults.length ? (
        <ScrollView
          style={styles.contentScrollView}
          contentContainerStyle={styles.contentContainer}
        >
          <Text style={styles.sectionHeader}>{t("mobileApp.searchScreen.popularTags")}</Text>
          <View style={styles.tagWrap}>{tagPills}</View>
          <TypeLinks />
        </ScrollView>
      ) : null}
      {isSearching ? (
        <View style={styles.centerContainer}>
          <DropletSpinner size={46} />
        </View>
      ) : null}
      {Boolean(searchValue && showSuggestions && !isSearching) ? (
        <ScrollView
          style={styles.resultsList}
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="handled"
        >
          {searchResults.length > 0 ? (
            <View>
              <Text style={styles.sectionHeader}>{t("mobileApp.searchScreen.catalogResults")}</Text>
              {searchResults.map((item, index) => (
                <View key={`${index}-${item.id || item.name}`}>
                  {optionDisplay(item, index)}
                </View>
              ))}
            </View>
          ) : null}
          {searchResults.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search" size={40} color={theme.colors.textMuted} />
              <Text style={styles.emptyText}>
                {t("mobileApp.searchScreen.noResults", { query: searchValue })}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

function TypeLinks() {
  const router = useRouter();
  const { t } = useTranslation("translation");
  return (
    <View style={styles.typeLinksContainer}>
      <Text style={styles.sectionHeader}>{t("mobileApp.searchScreen.discoverByCategory")}</Text>
      <Pressable
        onPress={() => router.navigate("/topSold")}
        style={styles.typeLinkCard}
        accessibilityRole="button"
      >
        <View style={styles.typeLinkRow}>
          <Text style={styles.typeLinkText}>{t("mobileApp.searchScreen.popularPurchases")}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
        </View>
      </Pressable>
      <Pressable
        onPress={() => router.navigate("/mostPlayed")}
        style={styles.typeLinkCard}
        accessibilityRole="button"
      >
        <View style={styles.typeLinkRow}>
          <Text style={styles.typeLinkText}>{t("mobileApp.searchScreen.topListened")}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
        </View>
      </Pressable>
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
    paddingBottom: 80,
    gap: 16,
  },
  sectionHeader: {
    ...theme.typography.sectionHeader,
    marginBottom: 4,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  typeLinksContainer: {
    gap: 12,
    marginTop: 8,
  },
  typeLinkCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  typeLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  typeLinkText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    paddingBottom: 80,
  },
});
