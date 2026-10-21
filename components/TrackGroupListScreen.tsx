import { useState } from "react";
import { Text, View, FlatList, Pressable, StyleSheet } from "react-native";
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import TrackGroupItem from "@/components/TrackGroupItem";
import ErrorNotification from "@/components/ErrorNotification";
import LoadingScreen from "@/components/LoadingScreen";
import { theme } from "@/constants/theme";
import { albumHref } from "@/scripts/routes";

type TrackGroupList = { results: AlbumProps[] };

type TrackGroupListScreenProps<K extends QueryKey> = {
  title: string;
  query: UseQueryOptions<TrackGroupList, Error, TrackGroupList, K>;
};

// A full-screen list of releases under a titled header, each opening its album page
export default function TrackGroupListScreen<K extends QueryKey>({
  title,
  query,
}: TrackGroupListScreenProps<K>) {
  const { isPending, isError, data, error } = useQuery(query);
  const { top } = useSafeAreaInsets();
  const router = useRouter();
  const [showError, setShowError] = useState<boolean>(true);

  if (isPending) {
    return <LoadingScreen />;
  }

  if (isError) {
    return (
      <View style={styles.loadingContainer}>
        <ErrorNotification
          visible={showError}
          onDismiss={() => setShowError(false)}
          error={error}
        />
      </View>
    );
  }

  return (
    <View style={[styles.mainWrapper, { paddingTop: top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={data.results}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              const href = albumHref(item);
              if (href) router.push(href);
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
  },
  headerSpacer: {
    width: 36,
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
