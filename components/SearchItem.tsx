import React from "react";
import { View, Pressable, Text, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Result } from "@/state/SearchContext";
import { theme } from "@/constants/theme";

type SearchItemProps = {
  result: Result;
  index: number;
};

export default function SearchItem({ result }: SearchItemProps) {
  const router = useRouter();

  const imageUri =
    result.imageUrl ||
    result.trackGroupCover?.sizes?.[120] ||
    result.trackGroupCover?.sizes?.[300] ||
    result.avatar?.sizes?.[120] ||
    result.avatar?.url;

  const imageSource = imageUri
    ? { uri: imageUri }
    : require("@/assets/images/nimue-blue-logo.png");

  const handlePress = () => {
    const target = constructUrl(result);
    if (typeof target === "string") {
      router.push(target as any);
    } else {
      router.push(target);
    }
  };

  const accentColor = result.accent || theme.colors.primary;
  const isGenreOrTag = Boolean(result.isGenre || result.isTag);

  return (
    <View style={styles.container}>
      <Pressable
        android_ripple={{ color: theme.colors.ripple }}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.pressable,
          pressed && styles.pressed,
        ]}
      >
        {isGenreOrTag ? (
          <View
            style={[
              styles.genreIconBox,
              {
                borderColor: accentColor,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Ionicons
              name={(result.icon as any) || (result.isGenre ? "compass-outline" : "pricetag-outline")}
              size={22}
              color={accentColor}
            />
          </View>
        ) : (
          <Image
            source={imageSource}
            style={[styles.image, result.isArtist && styles.artistAvatar]}
          />
        )}

        <View style={styles.textContainer}>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.name}>
            {(result.name || "").trim()}
          </Text>

          {result.subtitle ? (
            <Text ellipsizeMode="tail" numberOfLines={1} style={styles.subtitleText}>
              {result.subtitle}
            </Text>
          ) : result.artistName ? (
            <Text ellipsizeMode="tail" numberOfLines={1} style={styles.artistName}>
              {result.isStation
                ? result.artistName.trim()
                : `by ${result.artistName.trim()}`}
            </Text>
          ) : null}

          <View style={styles.metaBadgeRow}>
            <View
              style={[
                styles.categoryBadge,
                result.isGenre && { borderColor: accentColor },
              ]}
            >
              <Text
                style={[
                  styles.category,
                  result.isGenre && { color: accentColor },
                ]}
              >
                {result.category}
              </Text>
            </View>
            {result.matchedTag && !result.isTag && !result.isGenre ? (
              <Text style={styles.matchedTagBadge} numberOfLines={1}>
                #{result.matchedTag}
              </Text>
            ) : result.matchedGenre && !result.isGenre && !result.isTag ? (
              <Text style={styles.matchedTagBadge} numberOfLines={1}>
                {result.matchedGenre}
              </Text>
            ) : null}
          </View>
        </View>

        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.colors.textMuted}
          style={styles.chevron}
        />
      </Pressable>
    </View>
  );
}

export const constructUrl = (r: Result) => {
  if (!r) {
    return "/";
  }

  if (r.isGenre || r.isTag) {
    const cleanTag = (r.tagSlug || r.name || "").replace(/^#/, "").trim();
    return `/tags/${encodeURIComponent(cleanTag)}` as const;
  } else if (r.isStation) {
    return { pathname: "/station/[id]", params: { id: String(r.id) } } as const;
  } else if (r.isPodcast) {
    return { pathname: "/podcast/[id]", params: { id: String(r.id) } } as const;
  } else if (r.isTrackGroup) {
    return `/artist/${r.artistId}/album/${r.trackGroupId}/album-tracks` as const;
  } else if (r.isArtist) {
    return `/artist/${r.artistId}/artist-page` as const;
  } else {
    return `/tags/${encodeURIComponent(r.name.replace(/^#/, ""))}` as const;
  }
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  pressable: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
  },
  pressed: {
    opacity: 0.82,
  },
  image: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
  },
  artistAvatar: {
    borderRadius: theme.radius.full,
  },
  genreIconBox: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    marginLeft: 12,
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  artistName: {
    fontSize: 13,
    color: theme.colors.textCyan,
  },
  subtitleText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  metaBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: theme.radius.xs,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
  },
  category: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  matchedTagBadge: {
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  chevron: {
    marginLeft: 6,
  },
});
