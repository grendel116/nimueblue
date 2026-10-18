import { StyleSheet, View } from "react-native";
import DropletSpinner from "./DropletSpinner";
import { theme } from "@/constants/theme";

// The swirling droplet, sitting exactly where the system pull-to-refresh spinner rests
// (24dp below the top of the list, 40dp wide) and covering it while a refresh runs.
// Place it as a sibling above the scrolling list, inside a wrapper that has the list's bounds.
export default function RefreshOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.circle}>
        <DropletSpinner size={26} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 24,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
    elevation: 16,
  },
  circle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
  },
});
