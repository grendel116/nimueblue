import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import SwipeDownSheet, { SheetScrollView } from "@/components/SwipeDownSheet";
import { theme } from "@/constants/theme";
import { openInBrowser } from "@/scripts/openInBrowser";

interface SupportOption {
  title: string;
  handle: string;
  url: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}

const SUPPORT_OPTIONS: SupportOption[] = [
  {
    title: "Venmo",
    handle: "@davyrhodes_",
    url: "https://venmo.com/davyrhodes_",
    icon: "logo-venmo",
    description: "Send direct support via Venmo",
  },
  {
    title: "Cash App",
    handle: "$grendel116",
    url: "https://cash.app/$grendel116/",
    icon: "cash-outline",
    description: "Send direct support via Cash App",
  },
];

export default function SupportModal() {
  return (
    <SwipeDownSheet resetKey="support">
      <SheetScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Support NimueBlue</Text>
            <Text style={styles.subtitle}>
              Contributions directly support open music hosting, community federation, and ongoing development.
            </Text>
          </View>

          <View style={styles.optionsList}>
            {SUPPORT_OPTIONS.map((item) => (
              <Pressable
                key={item.title}
                onPress={() => openInBrowser(item.url)}
                style={({ pressed }) => [styles.optionCard, pressed && styles.optionCardPressed]}
                accessibilityRole="link"
                accessibilityLabel={`${item.title} ${item.handle}`}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name={item.icon} size={22} color={theme.colors.primary} />
                </View>
                <View style={styles.textContainer}>
                  <View style={styles.titleRow}>
                    <Text style={styles.optionTitle}>{item.title}</Text>
                    <Text style={styles.handleBadge}>{item.handle}</Text>
                  </View>
                  <Text style={styles.optionDescription}>{item.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.footerNote}>
            Thank you for keeping independent music free and decentralized.
          </Text>
        </View>
      </SheetScrollView>
    </SwipeDownSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  container: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  optionsList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    borderRadius: theme.radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  optionCardPressed: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.primary,
    opacity: 0.85,
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    marginLeft: 14,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  handleBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  optionDescription: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  footerNote: {
    marginTop: 24,
    paddingHorizontal: 12,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
});
