import { View, Text, Image, StyleSheet } from "react-native";
import { theme } from "@/constants/theme";

export default function TrackGroupItem({
  id,
  cover,
  title,
  artist,
  artistId,
  urlSlug,
}: AlbumProps) {
  return (
    <View style={styles.listItem}>
      <Image
        source={
          cover?.sizes
            ? { uri: cover?.sizes[120] }
            : require("@/assets/images/nimue-blue-logo.png")
        }
        style={styles.image}
      />
      <View style={styles.textContainer}>
        <Text
          style={styles.title}
          ellipsizeMode="tail"
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={styles.artist}
          ellipsizeMode="tail"
          numberOfLines={1}
        >
          {artist.name}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    marginVertical: 4,
  },
  image: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
  },
  textContainer: {
    marginLeft: 14,
    flex: 1,
    gap: 4,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  artist: {
    color: theme.colors.textCyan,
    fontSize: 13,
  },
});
