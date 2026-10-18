import React from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { theme } from "@/constants/theme";
import { openInBrowser } from "@/scripts/openInBrowser";
import { artistLinks } from "@/scripts/artistLinks";

// The artist's websites and social pages as icon chips that wrap onto new lines
export default function ArtistLinks({ artist }: { artist: Artist }) {
  const links = artistLinks(artist);
  if (links.length === 0) return null;

  return (
    <View style={styles.row}>
      {links.map((link) => (
        <Pressable
          key={link.url}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          onPress={() =>
            link.url.startsWith("mailto:") ? Linking.openURL(link.url) : openInBrowser(link.url)
          }
          accessibilityRole="link"
          accessibilityLabel={link.label}
        >
          {link.iconUrl ? (
            <Image source={{ uri: link.iconUrl }} style={styles.iconImage} />
          ) : (
            <FontAwesome6
              name={link.icon}
              size={14}
              color={theme.colors.primary}
              brand={link.brand}
              solid={!link.brand}
            />
          )}
          <Text style={styles.label} numberOfLines={1}>
            {link.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 220,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
  },
  pressed: {
    opacity: 0.75,
  },
  iconImage: {
    width: 14,
    height: 14,
    borderRadius: theme.radius.xs,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    flexShrink: 1,
  },
});
