import { Pressable, View, StyleSheet, Text, Image } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePlayer } from "@/state/PlayerContext";
import { formatTime, isTrackOwnedOrPreview } from "@/scripts/utils";
import { isSameTrack } from "@/state/player/trackUtils";
import FavoriteTrackButton from "./FavoriteTrackButton";
import AddToQueueButton from "./AddToQueueButton";
import DownloadTrackButton from "./DownloadTrackButton";
import { theme } from "@/constants/theme";
import { SAVED_SOURCE, useDownloads } from "@/scripts/downloadManager";

export interface TrackRowProps extends PlayPauseWrapperProps {
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onTrackMenu?: () => void;
}

export default function PlayPauseWrapper({
  trackObject,
  playableTracks,
  style,
  selectedAlbum,
  selectionMode,
  isSelected,
  onToggleSelect,
  onTrackMenu,
}: TrackRowProps) {
  const { activeTrack, playTrack, disabledTrackIds } = usePlayer(
    "activeTrack",
    "playTrack",
    "disabledTrackIds",
  );
  const downloads = useDownloads();

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

  const savedDuration = downloads.find((d) => d.id === trackObject.id)?.duration;
  const durationSeconds =
    trackObject.audio?.duration || trackObject.duration || savedDuration;

  return (
    <Pressable
      android_ripple={{ color: theme.colors.ripple }}
      onPress={() => {
        if (selectionMode && onToggleSelect) {
          onToggleSelect();
          return;
        }
        if (!canPlayTrack) return;
        playTrack(trackObject, playableTracks);
      }}
      onLongPress={onToggleSelect}
      style={({ pressed }) => [
        styles.listItem,
        thisSongSelected && styles.selectedListItem,
        selectionMode && isSelected && styles.checkedListItem,
        pressed && (canPlayTrack || selectionMode) && styles.listItemPressed,
        style,
      ]}
      accessibilityLabel={`Play ${trackObject?.title || "track"}`}
    >
      <View style={styles.trackDetailsRow}>
        {selectionMode ? (
          <Ionicons
            name={isSelected ? "checkbox" : "square-outline"}
            size={20}
            color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
            style={styles.checkboxIcon}
          />
        ) : artworkUri ? (
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
        {!selectionMode && canPlayTrack && (
          <AddToQueueButton track={trackObject} album={selectedAlbum} size={17} />
        )}
        {!selectionMode && <FavoriteTrackButton track={trackObject} size={17} />}
        {!selectionMode && selectedAlbum && selectedAlbum.source !== SAVED_SOURCE && (
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
          {durationSeconds ? formatTime(durationSeconds) : "0:00"}
        </Text>
        {!selectionMode && onTrackMenu && (
          <Pressable
            onPress={onTrackMenu}
            hitSlop={8}
            style={styles.menuBtn}
            accessibilityRole="button"
            accessibilityLabel={`Options for ${trackObject.title}`}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={16}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        )}
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
  checkedListItem: {
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.primary,
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
  checkboxIcon: {
    marginRight: 10,
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
  menuBtn: {
    padding: 4,
    marginLeft: 2,
  },
});
