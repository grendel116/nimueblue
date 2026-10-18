import React, { useState } from "react";
import { TouchableOpacity, StyleSheet, GestureResponderEvent } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePlayer } from "@/state/PlayerContext";
import { theme } from "@/constants/theme";

type AddToQueueButtonProps = {
  track: RNTrack;
  album?: AlbumProps;
  size?: number;
  color?: string;
};

export default function AddToQueueButton({
  track,
  album,
  size = 18,
  color = theme.colors.textSecondary,
}: AddToQueueButtonProps) {
  const { addToQueue } = usePlayer("addToQueue");
  const [justAdded, setJustAdded] = useState(false);

  const handlePress = (e: GestureResponderEvent) => {
    e?.stopPropagation?.();

    const trackToQueue: RNTrack = {
      ...track,
      artwork:
        track.artwork ||
        album?.cover?.sizes?.[600] ||
        album?.cover?.sizes?.[300] ||
        album?.cover?.sizes?.[120] ||
        "",
      artist: track.artist || album?.artist?.name || "",
      trackGroupId: track.trackGroupId || album?.id || album?.trackGroupId || 0,
      trackGroup: track.trackGroup || album,
    };

    addToQueue(trackToQueue);
    setJustAdded(true);
    setTimeout(() => {
      setJustAdded(false);
    }, 1500);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={justAdded ? "Added to queue" : `Add ${track.title || "song"} to queue`}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons
        name={justAdded ? "checkmark-circle-outline" : "add-circle-outline"}
        size={size}
        color={justAdded ? theme.colors.primary : color}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 2,
    justifyContent: "center",
    alignItems: "center",
  },
});
