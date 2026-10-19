import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  FlatList,
  Pressable,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as api from "../../queries/fetch/fetchWrapper";
import TrackGroupItem from "@/components/TrackGroupItem";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";
import LoadingScreen from "@/components/LoadingScreen";
import { albumHref } from "@/scripts/routes";
import OfflineNotice from "@/components/OfflineNotice";
import { openMainTab } from "@/components/Footer";
import { isNetworkError } from "@/scripts/networkError";

export default function TagsView() {
  const { tag } = useLocalSearchParams();

  const {
    isPending,
    isError,
    data,
    error,
    fetchNextPage,
    isFetchingNextPage,
    isFetching,
    refetch,
  } = useInfiniteQuery<{ results: AlbumProps[] }>({
    queryKey: ["infiniteTrackGroups", tag],
    queryFn: ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.append("skip", String(pageParam));
      params.append("take", String(20));
      params.append("tag", String(tag));

      return api.get(`/v1/trackGroups?${params}`, {});
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.results.length === 20 ? allPages.length * 10 : null;
    },
  });

  const { top } = useSafeAreaInsets();
  const router = useRouter();
  const trackGroups = data?.pages.flatMap((page) => page.results) || [];

  if (isPending) {
    return (
      <LoadingScreen />
    );
  }

  if (isError) {
    return (
      <OfflineNotice
        title={isNetworkError(error) ? "You're Offline" : `Can't Load #${tag}`}
        message={
          isNetworkError(error)
            ? "Can't reach Mirlo right now. Your downloaded music still plays."
            : error instanceof Error
            ? error.message
            : "Something went wrong loading these releases."
        }
        onDismiss={() => (router.canDismiss() ? router.dismiss() : router.back())}
        onOpenLibrary={() => openMainTab("library")}
      />
    );
  }

  const renderLoadingFooter = () => {
    if (!isFetchingNextPage) return null;

    return (
      <View style={{ marginVertical: 20 }}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
  };

  return (
    <View style={[styles.mainWrapper, { paddingTop: top }]}>
      <View style={styles.header}>
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
        <Text style={styles.headerTitle}>#{String(tag)}</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={trackGroups}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              const href = albumHref(item);
              if (href) router.navigate(href);
            }}
          >
            <TrackGroupItem
              id={item.id}
              cover={item.cover}
              title={item.title}
              artist={item.artist}
              artistId={item.artistId}
              urlSlug={item.urlSlug}
              userTrackGroupPurchases={item.userTrackGroupPurchases}
              releaseDate={item.releaseDate}
              tracks={item.tracks}
              trackGroupId={item.trackGroupId}
            />
          </Pressable>
        )}
        onEndReached={() => !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.2}
        ListFooterComponent={renderLoadingFooter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceCardBorder,
    backgroundColor: theme.colors.surface,
  },
  backBtn: {
    padding: 6,
  },
  headerTitle: {
    ...theme.typography.sectionHeader,
    fontSize: 15,
    color: theme.colors.primary,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
    gap: 4,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
