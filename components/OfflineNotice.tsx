import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";
import DropletSpinner from "./DropletSpinner";

// Shown on Home when Mirlo can't be reached: downloaded music is still one tap away
export default function OfflineNotice({
  retrying,
  onRetry,
  onOpenLibrary,
}: {
  retrying: boolean;
  onRetry: () => void;
  onOpenLibrary: () => void;
}) {
  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline-outline" size={52} color={theme.colors.textMuted} />
      <Text style={styles.title}>You're offline</Text>
      <Text style={styles.text}>Can't reach Mirlo right now. Your downloaded music still plays.</Text>
      <Pressable onPress={onOpenLibrary} style={styles.primary} accessibilityRole="button">
        <Ionicons name="musical-notes" size={16} color={theme.colors.playButtonIcon} />
        <Text style={styles.primaryText}>Open your library</Text>
      </Pressable>
      <Pressable onPress={onRetry} disabled={retrying} style={styles.secondary} accessibilityRole="button">
        {retrying ? (
          <DropletSpinner size={20} />
        ) : (
          <Text style={styles.secondaryText}>Try again</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingHorizontal: 32, paddingTop: 80, gap: 10 },
  title: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: "700", marginTop: 6 },
  text: { color: theme.colors.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 18 },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
  },
  primaryText: { color: theme.colors.playButtonIcon, fontSize: 14, fontWeight: "700" },
  secondary: { paddingVertical: 10, paddingHorizontal: 16, minHeight: 40, justifyContent: "center" },
  secondaryText: { color: theme.colors.primary, fontSize: 13, fontWeight: "600" },
});
