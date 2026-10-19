import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import SwipeDownSheet, { SheetScrollView } from "@/components/SwipeDownSheet";
import { Button } from "@/components/ui";
import { theme } from "@/constants/theme";
import { useIsOnline } from "@/scripts/useIsOnline";
import { openMainTab } from "@/components/Footer";

// Shown when Mirlo or the network cannot be reached. Uses a swipe down sheet
// like support and about menus, locked until the phone is back online.
export default function OfflineNotice({
  title = "You're Offline",
  message = "Can't reach Mirlo right now. Your downloaded music still plays.",
  onOpenLibrary,
  onDismiss,
}: {
  title?: string;
  message?: string;
  onOpenLibrary?: () => void;
  onDismiss?: () => void;
  retrying?: boolean;
  onRetry?: () => void;
}) {
  const isOnline = useIsOnline();

  const handleOpenLibrary = () => {
    if (onOpenLibrary) {
      onOpenLibrary();
    } else {
      openMainTab("library");
    }
  };

  return (
    <SwipeDownSheet
      resetKey={`offline-${isOnline ? "online" : "offline"}`}
      locked={!isOnline}
      onDismiss={onDismiss}
    >
      <SheetScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.iconCircle}>
            <Ionicons
              name={isOnline ? "cloud-done-outline" : "cloud-offline-outline"}
              size={48}
              color={isOnline ? theme.colors.primary : theme.colors.textMuted}
            />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={[styles.statusBadge, isOnline && styles.statusBadgeOnline]}>
            <Ionicons
              name={isOnline ? "checkmark-circle" : "lock-closed"}
              size={13}
              color={isOnline ? theme.colors.primary : theme.colors.textMuted}
            />
            <Text style={[styles.statusText, isOnline && styles.statusTextOnline]}>
              {isOnline
                ? "Connected • Swipe down to return"
                : "Offline • Reconnecting automatically"}
            </Text>
          </View>

          <View style={styles.actions}>
            <Button
              label="Open Your Library"
              icon="musical-notes"
              onPress={handleOpenLibrary}
              rounded
              style={styles.primaryBtn}
            />
          </View>
        </View>
      </SheetScrollView>
    </SwipeDownSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  container: {
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  message: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    marginTop: 4,
  },
  statusBadgeOnline: {
    borderColor: theme.colors.primary,
  },
  statusText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  statusTextOnline: {
    color: theme.colors.primary,
  },
  actions: {
    marginTop: 16,
    width: "100%",
    maxWidth: 240,
    alignItems: "center",
  },
  primaryBtn: {
    width: "100%",
    paddingHorizontal: 24,
  },
});
