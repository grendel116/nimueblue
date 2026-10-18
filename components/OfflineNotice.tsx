import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Button } from "@/components/ui";
import { theme } from "@/constants/theme";

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
      <Text style={styles.title}>You're Offline</Text>
      <Text style={styles.text}>Can't reach Mirlo right now. Your downloaded music still plays.</Text>
      <Button
        label="Open Your Library"
        icon="musical-notes"
        onPress={onOpenLibrary}
        rounded
        style={styles.primaryBtn}
      />
      <Button
        label="Try Again"
        variant="ghost"
        size="sm"
        onPress={onRetry}
        loading={retrying}
        textStyle={styles.secondaryText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingHorizontal: 32, paddingTop: 80, gap: 10 },
  title: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: "700", marginTop: 6 },
  text: { color: theme.colors.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 18 },
  primaryBtn: {
    marginTop: 14,
    paddingHorizontal: 24,
  },
  secondaryText: {
    color: theme.colors.primary,
  },
});
