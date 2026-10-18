import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMemo, type ComponentProps } from "react";
import { usePlayer } from "@/state/PlayerContext";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";
import AddToQueueButton from "@/components/AddToQueueButton";
import DownloadsTab from "@/components/DownloadsTab";
import FavoriteTrackButton from "@/components/FavoriteTrackButton";
import { groupTracksIntoAlbums, useDownloads } from "@/scripts/downloadManager";
import { resolveArtworkUrl } from "@/scripts/utils";
import { useStationLikes } from "@/scripts/stationLikes";
import { usePodcastShowBookmarks } from "@/scripts/podcastLikes";
import { useFaircampSaves, toggleFaircampArtistFollow } from "@/scripts/faircampSaves";
import { dragScroll } from "@/scripts/dragScroll";
import { Pill } from "@/components/ui";
import { FollowedArtist } from "@/queries/listener";
import {
  albumCover,
  buildBookmarks,
  buildFollowedArtists,
  buildWishlistAlbums,
} from "@/scripts/library";
import { albumHref } from "@/scripts/routes";
import { LibraryTab, setLibraryTab, useLibraryTab } from "@/state/libraryTab";

type IconName = ComponentProps<typeof Ionicons>["name"];

export default function LibraryScreen() {
  const router = useRouter();
  const { playTrack, activeTrack } = usePlayer("playTrack", "activeTrack");
  const activeTab = useLibraryTab();
  const downloadedTracks = useDownloads();
  const stationLikes = useStationLikes();
  const podcastShows = usePodcastShowBookmarks();
  const faircampSaves = useFaircampSaves();

  const downloadedAlbums = useMemo(
    () => groupTracksIntoAlbums(downloadedTracks),
    [downloadedTracks],
  );

  const wishlistAlbums = useMemo(
    () =>
      buildWishlistAlbums({
        faircampSaves,
        downloads: downloadedTracks,
      }),
    [faircampSaves, downloadedTracks],
  );
  const artists = useMemo(
    () => buildFollowedArtists({ faircampSaves }),
    [faircampSaves],
  );
  const bookmarks = useMemo(
    () => buildBookmarks({ stationLikes, podcastShows }),
    [stationLikes, podcastShows],
  );

  const tabs: { id: LibraryTab; label: string; icon: IconName; count: number }[] = [
    { id: "wishlist", label: "Wishlist", icon: "heart-outline", count: wishlistAlbums.length },
    {
      id: "downloads",
      label: "Downloads",
      icon: "download-outline",
      count: downloadedAlbums.length,
    },
    { id: "artists", label: "Artists", icon: "people-outline", count: artists.length },
    { id: "bookmarks", label: "Bookmarks", icon: "bookmark-outline", count: bookmarks.length },
  ];

  const renderEmpty = (icon: IconName, title: string, subtitle: string) => (
    <View style={styles.emptyContainer}>
      <Ionicons name={icon} size={48} color={theme.colors.textMuted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );

  const openAlbumPage = (tg: any) => {
    const href = albumHref(tg);
    if (href) router.push(href);
  };

  // One row for a release: cover, two lines of text, and a tap to its album page
  const renderReleaseCard = (tg: any, title: string, subtitle: string, fallbackIcon: IconName) => {
    const coverUri = albumCover(tg);
    return (
      <Pressable
        android_ripple={{ color: theme.colors.ripple }}
        onPress={() => openAlbumPage(tg)}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.placeholder]}>
            <Ionicons name={fallbackIcon} size={20} color={theme.colors.primary} />
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.cardArtist} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
      </Pressable>
    );
  };

  const renderWishlist = () => {
    if (wishlistAlbums.length === 0) {
      return renderEmpty(
        "heart-outline",
        "No saved albums",
        "Tap the heart on any song or album to save its album to your wishlist.",
      );
    }
    return (
      <FlatList
        data={wishlistAlbums}
        keyExtractor={(item, index) => `album-${item.trackGroup?.urlSlug}-${index}`}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={5}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) =>
          renderReleaseCard(
            item.trackGroup,
            item.trackGroup?.title || "Saved Album",
            item.trackGroup?.artist?.name || "Artist",
            "heart",
          )
        }
      />
    );
  };

  const renderArtists = () => {
    if (artists.length === 0) {
      return renderEmpty(
        "people-outline",
        "No followed artists",
        "Follow an artist from their page to keep them in your library.",
      );
    }
    return (
      <FlatList
        data={artists}
        keyExtractor={({ artist }) => `artist-${artist.urlSlug ?? artist.id}`}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <FollowedArtistRow
            followed={item}
            onOpen={() =>
              router.push({
                pathname: "/artist/[id]/artist-page",
                params: { id: item.artist.urlSlug ?? String(item.artist.id) },
              })
            }
          />
        )}
      />
    );
  };

  const renderBookmarks = () => {
    if (bookmarks.length === 0) {
      return renderEmpty(
        "bookmark-outline",
        "No bookmarks yet",
        "Bookmark a radio station or podcast to keep it here.",
      );
    }
    const stationTracks = bookmarks.flatMap((b) => (b.kind === "station" ? [b.track] : []));
    return (
      <FlatList
        data={bookmarks}
        keyExtractor={(item) =>
          item.kind === "station" ? `station-${item.track.liveStation}` : `show-${item.show.showId}`
        }
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={5}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          if (item.kind === "show") {
            const { show } = item;
            return (
              <Pressable
                android_ripple={{ color: theme.colors.ripple }}
                onPress={() => router.push({ pathname: "/podcast/[id]", params: { id: show.showId } })}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                {show.artwork ? (
                  <Image source={{ uri: resolveArtworkUrl(show.artwork) }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.placeholder]}>
                    <Ionicons name="mic-outline" size={20} color={theme.colors.primary} />
                  </View>
                )}
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {show.name}
                  </Text>
                  <Text style={styles.cardArtist} numberOfLines={1}>
                    {show.author}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </Pressable>
            );
          }
          const { track } = item;
          const isSelected = Boolean(activeTrack?.url && activeTrack.url === track.url);
          return (
            <Pressable
              android_ripple={{ color: theme.colors.ripple }}
              onPress={() => playTrack(track, stationTracks, "Bookmarks")}
              style={({ pressed }) => [
                styles.card,
                isSelected && styles.selectedCard,
                pressed && styles.cardPressed,
              ]}
            >
              {track.artwork ? (
                <Image source={{ uri: track.artwork }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.placeholder]}>
                  <Ionicons name="radio-outline" size={20} color={theme.colors.primary} />
                </View>
              )}
              <View style={styles.cardInfo}>
                <Text
                  style={[
                    styles.cardTitle,
                    isSelected && { color: theme.colors.primary, fontWeight: "700" },
                  ]}
                  numberOfLines={1}
                >
                  {track.title}
                </Text>
                <Text style={styles.cardArtist} numberOfLines={1}>
                  {track.artist}
                </Text>
              </View>
              <View style={styles.actionRow}>
                <AddToQueueButton track={track} size={17} />
                <FavoriteTrackButton track={track} size={17} />
              </View>
            </Pressable>
          );
        }}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleCol}>
            <Text style={styles.title}>Your Library</Text>
            <Text style={styles.subtitle}>
              Your wishlist, downloads, artists & bookmarks
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push("/aboutModal")}
              style={({ pressed }) => [styles.infoButton, pressed && { opacity: 0.6 }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="About NimueBlue"
            >
              <Ionicons name="information-circle-outline" size={22} color={theme.colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* Scrollable Segmented Toggle Pills */}
        <ScrollView
          ref={dragScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toggleRow}
        >
          {tabs.map((tab) => (
            <Pill
              key={tab.id}
              label={tab.label}
              count={tab.count}
              icon={tab.icon}
              active={activeTab === tab.id}
              onPress={() => setLibraryTab(tab.id)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.contentArea}>
        {activeTab === "wishlist" && renderWishlist()}
        {activeTab === "downloads" && <DownloadsTab />}
        {activeTab === "artists" && renderArtists()}
        {activeTab === "bookmarks" && renderBookmarks()}
      </View>
    </SafeAreaView>
  );
}

// A followed artist: avatar and name open their page, with an Unfollow button
function FollowedArtistRow({ followed, onOpen }: { followed: FollowedArtist; onOpen: () => void }) {
  const { artist } = followed;
  const avatarUri = resolveArtworkUrl(
    artist.avatar?.sizes?.[120] || artist.avatar?.sizes?.[300] || artist.avatar?.url,
  );
  const handleUnfollow = () => {
    toggleFaircampArtistFollow(artist);
  };
  return (
    <Pressable
      android_ripple={{ color: theme.colors.ripple }}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {avatarUri ? (
        <Image source={{ uri: avatarUri }} style={[styles.thumb, styles.avatar]} />
      ) : (
        <View style={[styles.thumb, styles.avatar, styles.placeholder]}>
          <Ionicons name="person" size={20} color={theme.colors.primary} />
        </View>
      )}
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {artist.name}
        </Text>
        <Text style={styles.cardArtist}>Following</Text>
      </View>
      <TouchableOpacity
        onPress={handleUnfollow}
        style={styles.unfollowBtn}
        accessibilityRole="button"
        accessibilityLabel={`Unfollow ${artist.name}`}
      >
        <Text style={styles.unfollowText}>Unfollow</Text>
      </TouchableOpacity>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceCardBorder,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  headerTitleCol: {
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoButton: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 18,
    fontWeight: "normal",
    color: theme.colors.textPrimary,
    letterSpacing: 0.8,
  },
  subtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  listContent: {
    padding: 12,
    paddingBottom: 80,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
  },
  cardPressed: {
    opacity: 0.75,
    backgroundColor: theme.colors.surfaceElevated,
  },
  selectedCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderColor: theme.colors.primary,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 8,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceElevated,
  },
  placeholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  avatar: {
    borderRadius: theme.radius.full,
  },
  unfollowBtn: {
    minWidth: 84,
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    backgroundColor: theme.colors.surfaceElevated,
  },
  unfollowText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  cardArtist: {
    color: theme.colors.textCyan,
    fontSize: 12,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 10,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  emptySubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
});
