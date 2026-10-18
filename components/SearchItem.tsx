import { View, Pressable, Text, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSearch } from "@/state/SearchContext";
import { theme } from "@/constants/theme";

type Result = {
  result: {
    id: number | string;
    name: string;
    category?: string;
    artistId?: number | string;
    trackGroupId?: number | string;
    artistName?: string;
    avatar?: {
      url: string;
      sizes?: { [key: string]: string };
      updatedAt: string;
    };
    trackGroupCover?: {
      sizes: {
        60: string;
        120: string;
        300: string;
        600: string;
        960: string;
        1200: string;
        1500: string;
      };
    };
  };
  index: number;
};

export default function SearchItem({ result, index }: Result) {
  const router = useRouter();
  const { setSearchResults, setShowSuggestions } = useSearch();
  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => {
          setSearchResults([]);
          setShowSuggestions(false);
          router.back();
          router.navigate(constructUrl(result));
        }}
        style={styles.pressable}
      >
        <Image
          source={
            result.trackGroupCover?.sizes?.[120]
              ? { uri: result.trackGroupCover.sizes[120] }
              : result.avatar?.sizes?.[120]
                ? { uri: result.avatar.sizes[120] }
                : require("@/assets/images/nimue-blue-logo.png")
          }
          style={styles.image}
        />
        <View style={styles.textContainer}>
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={styles.name}
          >
            {result.name.trim()}
          </Text>
          {result.artistName && (
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={styles.artistName}
            >
              by {result.artistName.trim()}
            </Text>
          )}
          <Text style={styles.category}>{result.category}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const constructUrl = (r: any) => {
  if (!r) {
    return "/";
  }

  if (r.isTrack) {
    return `/artist/${r.artistId}/album/${r.trackGroupId}/tracks/${r.id}` as const;
  } else if (r.isTrackGroup) {
    return `/artist/${r.artistId}/album/${r.trackGroupId}/album-tracks` as const;
  } else if (r.isArtist) {
    return `/artist/${r.artistId}/artist-page` as const;
  } else {
    return `/tags/${r.name}` as const;
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
  image: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
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
  category: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
