import { StyleSheet, Text, View, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";
import type { InAppStoreViewProps } from "./InAppStoreView";

export function InAppStoreView({ url, title, source, onClose }: InAppStoreViewProps) {
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = source || "Store";
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to Mirlo"
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title || source || "External Store"}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {hostname}
          </Text>
        </View>

        <Pressable
          onPress={() => window.open(url, "_blank")}
          style={styles.openExternalButton}
          accessibilityRole="button"
          accessibilityLabel="Open in new tab"
        >
          <Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.iframeWrapper}>
        <iframe
          src={url}
          style={{
            width: "100%",
            height: "100%",
            flex: 1,
            border: "none",
            backgroundColor: theme.colors.background,
          }}
          title={title || "Store"}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: "100%",
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceCardBorder,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingRight: 8,
    cursor: "pointer" as const,
  },
  backText: {
    fontFamily: theme.typography.body.fontFamily,
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontFamily: theme.typography.body.fontFamily,
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: theme.typography.caption.fontFamily,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  openExternalButton: {
    padding: 6,
    cursor: "pointer" as const,
  },
  iframeWrapper: {
    flex: 1,
    minHeight: 520,
    backgroundColor: theme.colors.background,
  },
});
