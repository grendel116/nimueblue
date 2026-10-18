import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import Ionicons from "@expo/vector-icons/Ionicons";
import SwipeDownSheet, { SheetScrollView } from "@/components/SwipeDownSheet";
import { theme } from "@/constants/theme";
import { openInBrowser } from "@/scripts/openInBrowser";

type AboutLink = {
  label: string;
  subtitle?: string;
  url: string;
  icon: string;
  brand?: boolean;
};

const LINKS: AboutLink[] = [
  {
    label: "Fairplayer Hub",
    subtitle: "Verified Faircamp catalogs & federation",
    url: "https://fairplayer.band/hub/",
    icon: "compact-disc",
    brand: false,
  },
  {
    label: "Radio-Browser",
    subtitle: "Community directory of live internet radio",
    url: "https://www.radio-browser.info/",
    icon: "tower-broadcast",
    brand: false,
  },
  {
    label: "Castopod Index",
    subtitle: "Open directory of fediverse podcasts",
    url: "https://index.castopod.org/",
    icon: "podcast",
    brand: false,
  },
  {
    label: "Mirlo Open Source",
    subtitle: "Upstream source & Canimus Chorus catalog",
    url: "https://github.com/funmusicplace/mirlo-mobile",
    icon: "code-branch",
    brand: false,
  },
  {
    label: "GNU AGPL v3.0 License",
    subtitle: "Free & open-source software license",
    url: "https://www.gnu.org/licenses/agpl-3.0.html",
    icon: "scale-balanced",
    brand: false,
  },
];

function open(url: string) {
  if (url.startsWith("mailto:")) Linking.openURL(url);
  else openInBrowser(url);
}

// Federated catalogs, open directories, and source code repositories behind NimueBlue.
export default function AboutModal() {
  return (
    <SwipeDownSheet resetKey="about">
      <SheetScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.linkList}>
            {LINKS.map((link) => (
              <Pressable
                key={link.label}
                onPress={() => open(link.url)}
                style={({ pressed }) => [styles.linkCard, pressed && styles.linkCardPressed]}
                accessibilityRole="link"
                accessibilityLabel={link.label}
              >
                <View style={styles.iconContainer}>
                  <FontAwesome6
                    name={link.icon}
                    size={18}
                    color={theme.colors.primary}
                    brand={link.brand}
                    solid={!link.brand}
                  />
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.linkLabel}>{link.label}</Text>
                  {link.subtitle ? (
                    <Text style={styles.linkSubtitle} numberOfLines={1}>
                      {link.subtitle}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.licenseNotice}>
            NimueBlue is free software released under the GNU Affero General Public License v3.0.
            Portions Copyright © 2025 Mirlo US LLC; modifications Copyright © 2026 Davy
            (grendel116).
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
    paddingTop: 20,
    paddingBottom: 40,
  },
  container: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  linkList: {
    gap: 10,
  },
  linkCard: {
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
  linkCardPressed: {
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
  linkLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  linkSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  licenseNotice: {
    marginTop: 18,
    paddingHorizontal: 6,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
});
