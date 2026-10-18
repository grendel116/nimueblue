import { StyleSheet, Text, View, Pressable } from "react-native";
import { WebView } from "react-native-webview";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";
import { openInBrowser } from "@/scripts/openInBrowser";
import { Loading } from "./ui";

export type InAppStoreViewProps = {
  url: string;
  title?: string;
  source?: string;
  onClose: () => void;
};

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
          onPress={() => openInBrowser(url)}
          style={styles.openExternalButton}
          accessibilityRole="button"
          accessibilityLabel="Open in external browser"
        >
          <Ionicons name="open-outline" size={18} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      <WebView
        source={{ uri: url }}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <Loading label={`Opening ${source || "store"}...`} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  },
  webview: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
});
