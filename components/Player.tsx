import { View, TouchableOpacity, StyleSheet, ViewProps } from "react-native";
import { usePlayer } from "@/state/PlayerContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import NextButton from "./NextButton";
import PrevButton from "./PrevButton";
import LoopButton from "./LoopButton";
import ShuffleButton from "./ShuffleButton";
import { theme } from "@/constants/theme";

type PlayButtonProps = {
  buttonColor?: string;
};

export default function Player({ style }: ViewProps) {
  return (
    <View style={[styles.buttonsContainer, style]}>
      <ShuffleButton />
      <PrevButton />
      <PlayerPlayButton />
      <NextButton />
      <LoopButton />
    </View>
  );
}

function PlayerPlayButton({ buttonColor }: PlayButtonProps) {
  const { togglePlayPause, isPlaying } = usePlayer("togglePlayPause", "isPlaying");

  return (
    <TouchableOpacity
      style={styles.playButton}
      onPress={togglePlayPause}
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? "Pause" : "Play"}
    >
      <Ionicons
        name={isPlaying ? "pause" : "play"}
        size={32}
        color={theme.colors.playButtonIcon}
        style={!isPlaying && { transform: [{ translateX: 3 }] }}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  buttonsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
});
