import { useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePlayer } from "@/state/PlayerContext";
import { findStation, liveTrack, queryRadioPlays, RadioPlay, RadioStation } from "@/queries/radio";
import FavoriteTrackButton from "@/components/FavoriteTrackButton";
import AddToQueueButton from "@/components/AddToQueueButton";
import { openInBrowser } from "@/scripts/openInBrowser";
import { theme } from "@/constants/theme";
import {
  isQualityArtwork,
  resolveArtworkUrl,
} from "@/scripts/utils";

// A station's screen, displaying the live broadcast, current on-air track entry, and station details
export default function StationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const station = findStation(id);
  const router = useRouter();
  const { data: plays = [] } = useQuery(queryRadioPlays(station));
  const { activeTrack } = usePlayer("activeTrack");
  const [imgError, setImgError] = useState(false);

  if (!station || !isQualityArtwork(station.artwork)) {
    return null;
  }
  const onAir = plays[0];
  const isPlaying = activeTrack?.liveStation === station.id;
  const onAirArtwork = onAir?.artwork;
  const rawArt = isQualityArtwork(onAirArtwork) ? onAirArtwork : station.artwork;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.topNav}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
      </View>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.listContainer}
      >
        <View style={styles.headerSection}>
          <View style={styles.coverWrapper}>
            {!imgError && isQualityArtwork(rawArt) && (
              <Image
                source={{ uri: resolveArtworkUrl(rawArt) }}
                style={styles.coverImage}
                resizeMode="cover"
                onError={() => setImgError(true)}
              />
            )}
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaTitles}>
              <Text style={styles.mainTitle} numberOfLines={1}>
                {station.liveName}
              </Text>
              <Text style={styles.locationText}>Live from {station.location}</Text>
            </View>
            <View style={styles.actions}>
              <AddToQueueButton track={liveTrack(station)} size={28} />
              <FavoriteTrackButton
                track={liveTrack(station)}
                size={28}
                style={{ marginHorizontal: 8 }}
              />
              <StationPlayButton station={station} />
            </View>
          </View>
        </View>

        {onAir && (
          <PlayRow play={onAir} onAir={true} highlighted={isPlaying} />
        )}

        <View style={styles.footerSection}>
          <Text style={styles.aboutHeader}>About</Text>
          <Text style={styles.aboutText}>{station.about}</Text>
          <Pressable
            onPress={() => openInBrowser(station.playlistPage)}
            accessibilityRole="link"
            style={styles.footerLink}
          >
            <Text style={styles.linkText}>Full Playlist</Text>
            <Ionicons name="open-outline" size={14} color={theme.colors.textCyan} />
          </Pressable>
          <Pressable
            onPress={() => openInBrowser(station.donatePage)}
            style={styles.donateButton}
            accessibilityRole="button"
            accessibilityLabel={`Donate to ${station.name}`}
          >
            <Ionicons name="heart" size={16} color={theme.colors.playButtonIcon} />
            <Text style={styles.donateText}>Donate</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Plays the station like an album's play button: pauses it when it's already on
function StationPlayButton({ station }: { station: RadioStation }) {
  const { activeTrack, isPlaying, playTrack, togglePlayPause } = usePlayer("activeTrack", "isPlaying", "playTrack", "togglePlayPause");
  const isCurrent = activeTrack?.liveStation === station.id;
  const onPress = () => {
    if (isCurrent) {
      togglePlayPause();
      return;
    }
    const track = liveTrack(station);
    playTrack(track, [track], station.liveName);
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={isCurrent && isPlaying ? "Pause station" : "Play station"}
      style={styles.playBtn}
    >
      <Ionicons
        name={isCurrent && isPlaying ? "pause" : "play"}
        size={24}
        color={theme.colors.playButtonIcon}
        style={
          isCurrent && isPlaying
            ? undefined
            : { transform: [{ translateX: 2 }] }
        }
      />
    </TouchableOpacity>
  );
}

// The single on-air track entry for the current broadcast
function PlayRow({ play, onAir, highlighted }: { play: RadioPlay; onAir: boolean; highlighted: boolean }) {
  const [imgError, setImgError] = useState(false);
  const airtime = new Date(play.airdate).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const thumbSource = (!imgError && isQualityArtwork(play.artwork))
    ? { uri: resolveArtworkUrl(play.artwork) }
    : undefined;

  return (
    <View style={[styles.row, highlighted && styles.rowHighlighted]}>
      <Image
        source={thumbSource}
        style={styles.rowThumb}
        resizeMode="cover"
        onError={() => setImgError(true)}
      />
      <View style={styles.rowText}>
        <Text
          style={[styles.rowTitle, highlighted && styles.rowTitleHighlighted]}
          numberOfLines={1}
        >
          {play.song}
        </Text>
        <Text style={styles.rowArtist} numberOfLines={1}>
          {play.artist}
        </Text>
      </View>
      <Text style={[styles.rowTime, onAir && styles.rowTimeOnAir]}>
        {onAir ? "On air" : airtime}
      </Text>
    </View>
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
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: theme.colors.background,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  headerSection: {
    marginBottom: 16,
    paddingTop: 12,
  },
  coverWrapper: {
    width: "100%",
    maxWidth: theme.coverMaxSize,
    alignSelf: "center",
    aspectRatio: 1,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
    marginBottom: 16,
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaTitles: {
    flex: 1,
    marginRight: 12,
  },
  mainTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  locationText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 2,
    borderRadius: theme.radius.sm,
  },
  rowHighlighted: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
  },
  rowThumb: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.sm,
    marginRight: 10,
    backgroundColor: theme.colors.surfaceElevated,
  },
  rowText: {
    flex: 1,
    paddingRight: 10,
  },
  rowTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "500",
  },
  rowTitleHighlighted: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  rowArtist: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  rowTime: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  rowTimeOnAir: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  footerSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surfaceCardBorder,
  },
  aboutHeader: {
    ...theme.typography.sectionHeader,
    fontSize: 13,
    marginBottom: 4,
  },
  aboutText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  footerLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  linkText: {
    color: theme.colors.textCyan,
    fontSize: 14,
    fontWeight: "600",
  },
  donateButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
  },
  donateText: {
    color: theme.colors.playButtonIcon,
    fontSize: 15,
    fontWeight: "700",
  },
});
