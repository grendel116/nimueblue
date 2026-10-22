import { Pressable, View, StyleSheet, Text, Image } from "react-native";
import { usePlayer } from "@/state/PlayerContext";
import { formatTime, isTrackOwnedOrPreview } from "@/scripts/utils";
import { isSameTrack } from "@/state/player/trackUtils";
import FavoriteTrackButton from "./FavoriteTrackButton";
import AddToQueueButton from "./AddToQueueButton";
import DownloadTrackButton from "./DownloadTrackButton";
import { theme } from "@/constants/theme";
import { SAVED_SOURCE } from "@/scripts/downloadManager";

export default function PlayPauseWrapper({
  trackObject,
  playableTracks,
  style,
  selectedAlbum,
}: PlayPauseWrapperProps) {
  const { activeTrack, playTrack, disabledTrackIds } = usePlayer("activeTrack", "playTrack", "disabledTrackIds");

  const canPlayTrack = isTrackOwnedOrPreview(
    trackObject,
    null,
    selectedAlbum,
    disabledTrackIds,
  );
  const thisSongSelected = Boolean(
    activeTrack && isSameTrack(activeTrack, trackObject),
  );

  const contributors = trackObject.trackArtists
    ?.map((a) => a.artistName)
    .join(", ");
  const hasContributor = Boolean(
    contributors &&
      trackObject.trackArtists?.length &&
      trackObject.trackArtists[0].artistName !== trackObject.artist,
  );

  const textColor = canPlayTrack
    ? thisSongSelected
      ? theme.colors.primary
      : theme.colors.textPrimary
    : theme.colors.textMuted;

  const artworkUri =
    selectedAlbum?.cover?.sizes?.[120] ||
    selectedAlbum?.cover?.sizes?.[300] ||
    trackObject.trackGroup?.cover?.sizes?.[120] ||
    trackObject.trackGroup?.cover?.sizes?.[300] ||
    trackObject.artwork ||
    selectedAlbum?.cover?.sizes?.[600];

  return (
    <Pressable
      android_ripple={{ color: theme.colors.ripple }}
      onPress={() => {
        if (!canPlayTrack) return;
        playTrack(trackObject, playableTracks);
      }}
      style={({ pressed }) => [
        styles.listItem,
        thisSongSelected && styles.selectedListItem,
        pressed && canPlayTrack && styles.listItemPressed,
        style,
      ]}
      accessibilityLabel={`Play ${trackObject?.title || "track"}`}
    >
      <View style={styles.trackDetailsRow}>
        {artworkUri ? (
          <Image
            source={{ uri: artworkUri }}
            style={styles.trackThumb}
            resizeMode="cover"
          />
        ) : (
          <Text
            style={[
              styles.orderText,
              {
                color: thisSongSelected
                  ? theme.colors.primary
                  : theme.colors.textSecondary,
                fontWeight: thisSongSelected ? "700" : "500",
              },
            ]}
          >
            {trackObject.order}.
          </Text>
        )}
        <View style={styles.titleContainer}>
          <Text
            style={[
              styles.titleText,
              {
                color: textColor,
                fontWeight: thisSongSelected ? "700" : "500",
              },
            ]}
            ellipsizeMode="tail"
            numberOfLines={1}
          >
            {trackObject.title}
          </Text>
          {hasContributor ? (
            <View style={styles.subtitleRow}>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={styles.contributorText}
              >
                {contributors}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.actionRow}>
        {canPlayTrack && (
          <AddToQueueButton track={trackObject} album={selectedAlbum} size={17} />
        )}
        <FavoriteTrackButton track={trackObject} size={17} />
        {selectedAlbum && selectedAlbum.source !== SAVED_SOURCE && (
          <DownloadTrackButton track={trackObject} album={selectedAlbum} />
        )}
        <Text
          style={[
            styles.durationText,
            {
              color: thisSongSelected
                ? theme.colors.primary
                : theme.colors.textSecondary,
              fontWeight: thisSongSelected ? "700" : "400",
            },
          ]}
        >
          {trackObject.audio?.duration
            ? formatTime(trackObject.audio.duration)
            : "0:00"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: "space-between",
    marginVertical: 2,
    borderRadius: theme.radius.sm,
  },
  selectedListItem: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
  },
  listItemPressed: {
    backgroundColor: theme.colors.surfaceElevated,
    opacity: 0.8,
  },
  trackDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flex: 1,
    paddingRight: 10,
  },
  orderText: {
    fontSize: 14,
    width: 26,
    marginLeft: 2,
  },
  trackThumb: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.sm,
    marginRight: 10,
    backgroundColor: theme.colors.surfaceElevated,
  },
  titleContainer: {
    flex: 1,
  },
  titleText: {
    fontSize: 15,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    flexWrap: "nowrap",
  },
  contributorText: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  durationText: {
    fontSize: 13,
  },
});
