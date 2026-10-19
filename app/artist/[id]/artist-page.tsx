import { useQuery } from "@tanstack/react-query";
import { queryArtist } from "@/queries/queries";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  FlatList,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Markdown from "react-native-markdown-display";
import React, { useState } from "react";
import { htmlToMarkdown, linkifyUrls } from "@/scripts/utils";
import { openInBrowser } from "@/scripts/openInBrowser";
import { albumHref } from "@/scripts/routes";
import { theme } from "@/constants/theme";
import LoadingScreen from "@/components/LoadingScreen";
import ArtistActions from "@/components/artist/ArtistActions";
import ArtistLinks from "@/components/artist/ArtistLinks";
import CatalogueCard from "@/components/artist/CatalogueCard";
import ArtistPosts from "@/components/artist/ArtistPosts";
import OfflineNotice from "@/components/OfflineNotice";
import { openMainTab } from "@/components/Footer";
import { isNetworkError } from "@/scripts/networkError";

export default function ArtistPage() {
  const { id } = useLocalSearchParams();
  const routeId = String(id ?? "");
  const { data, isError, isPending, error, isFetching, refetch } = useQuery(
    queryArtist({ artistSlug: routeId }),
  );
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [listWidth, setListWidth] = useState<number>(0);
  const effectiveWidth = listWidth > 0 ? listWidth : windowWidth;
  const itemWidth = Math.min(
    theme.coverMaxSize,
    Math.max(110, Math.floor((effectiveWidth - 48) / 2)),
  );

  if (isPending) {
    return (
      <LoadingScreen />
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.topNav}>
          <Pressable
            onPress={() => (router.canDismiss() ? router.dismiss() : router.back())}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={theme.colors.textPrimary}
            />
          </Pressable>
        </View>
        {isNetworkError(error) ? (
          <OfflineNotice
            retrying={isFetching}
            onRetry={refetch}
            onOpenLibrary={() => openMainTab("library")}
          />
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={styles.errorText}>Error loading artist: {error.message}</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  const artistInfo = data;
  const bannerUri =
    artistInfo.background?.sizes?.["1024"] || artistInfo.background?.sizes?.["625"];

  const getModifiedData = (data: any) => {
    if (!data || data.length === 0) return [];
    if (data.length % 2 !== 0) {
      return [...data, { id: "placeholder", isPlaceholder: true }];
    }
    return data;
  };

  const handleEmpty = () => {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No releases found for this artist.</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topNav}>
        <Pressable
          onPress={() => router.dismiss()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={theme.colors.textPrimary}
          />
        </Pressable>
      </View>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContainer}
        onLayout={(e) => {
          const measured = e.nativeEvent.layout.width;
          if (measured > 0 && measured !== listWidth) {
            setListWidth(measured);
          }
        }}
        horizontal={false}
        columnWrapperStyle={styles.columnWrapper}
        numColumns={2}
        ListEmptyComponent={handleEmpty}
        data={getModifiedData(artistInfo.trackGroups)}
        renderItem={({ item }) => {
          if (item.isPlaceholder) {
            return <View style={[styles.albumItem, { width: itemWidth, opacity: 0 }]} />;
          }

          const coverUri =
            item.cover?.sizes?.[600] ||
            item.cover?.sizes?.[300] ||
            item.cover?.sizes?.[120] ||
            "";

          return (
            <Pressable
              style={[styles.albumItem, { width: itemWidth }]}
              onPress={() => {
                const href = albumHref(item);
                if (href) router.navigate(href);
              }}
            >
              <View style={[styles.albumCoverWrap, { width: itemWidth, height: itemWidth }]}>
                <Image
                  style={[styles.albumCover, { width: itemWidth, height: itemWidth }]}
                  source={{
                    uri: coverUri,
                  }}
                  resizeMode="cover"
                />
              </View>
              <Text style={styles.albumTitle} numberOfLines={2}>
                {item.title}
              </Text>
            </Pressable>
          );
        }}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            {bannerUri ? (
              <Image
                style={styles.bannerImage}
                source={{ uri: bannerUri }}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.introBanner}>
              {artistInfo.avatar ? (
                <Image
                  style={styles.avatar}
                  source={{
                    uri: artistInfo.avatar?.sizes?.[600] || "",
                  }}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={28} color={theme.colors.primary} />
                </View>
              )}
              <View style={styles.artistDetails}>
                <Text style={styles.artistName}>
                  {artistInfo.name}
                </Text>
                {artistInfo.location ? (
                  <View style={styles.locationRow}>
                    <Ionicons
                      name="location-outline"
                      size={15}
                      color={theme.colors.textCyan}
                    />
                    <Text style={styles.locationText}>
                      {artistInfo.location}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <ArtistActions artist={artistInfo} routeId={routeId} />
            <ArtistLinks artist={artistInfo} />
            {artistInfo.onMirlo ? (
              <CatalogueCard artist={artistInfo} routeId={routeId} />
            ) : null}
            <Text style={styles.releasesHeader}>Discography</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footerContainer}>
            <Text style={styles.aboutHeader}>
              About
            </Text>

            {artistInfo.bio ? (
              <Markdown
                onLinkPress={(url) => {
                  openInBrowser(url);
                  return false;
                }}
                style={{
                  body: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 22 },
                  link: { color: theme.colors.textCyan },
                }}
              >
                {linkifyUrls(
                  htmlToMarkdown(artistInfo.bio).replace(/([^\n])\n([^\n])/g, "$1 $2"),
                )}
              </Markdown>
            ) : (
              <Text style={styles.bioFallback}>
                {artistInfo.onMirlo
                  ? `${artistInfo.name} is an artist on Mirlo.`
                  : routeId.startsWith("saved-")
                    ? `${artistInfo.name} — music on this device.`
                    : `${artistInfo.name} is an artist on Faircamp.`}
              </Text>
            )}
            {artistInfo.onMirlo ? (
              <ArtistPosts artist={artistInfo} routeId={routeId} />
            ) : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 52,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceCardBorder,
  },
  backBtn: {
    padding: 6,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
  },
  list: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContainer: {
    paddingBottom: 80,
  },
  columnWrapper: {
    justifyContent: "center",
    columnGap: 16,
    paddingHorizontal: 16,
  },
  headerContainer: {
    marginBottom: 16,
  },
  bannerImage: {
    width: "100%",
    height: 160,
    backgroundColor: theme.colors.surface,
  },
  introBanner: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    alignItems: "center",
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  avatarPlaceholder: {
    backgroundColor: theme.colors.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
  },
  artistDetails: {
    marginLeft: 14,
    flex: 1,
    gap: 4,
  },
  artistName: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  releasesHeader: {
    ...theme.typography.sectionHeader,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  albumItem: {
    marginBottom: 18,
  },
  albumCoverWrap: {
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  albumCover: {
    width: "100%",
    height: "100%",
  },
  albumTitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  footerContainer: {
    marginHorizontal: 16,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surfaceCardBorder,
  },
  aboutHeader: {
    ...theme.typography.sectionHeader,
    marginBottom: 10,
  },
  bioFallback: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
  },
});
