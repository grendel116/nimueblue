import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, View, ViewProps } from "react-native";
import SearchBar from "./searchBar";
import { useRouter } from "expo-router";
import { theme } from "@/constants/theme";

export default function SearchHeader({ style }: ViewProps) {
  const router = useRouter();

  return (
    <View style={[styles.headerContainer, style]}>
      <Pressable
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace("/");
          }
        }}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons
          name="chevron-back"
          size={24}
          color={theme.colors.textPrimary}
        />
      </Pressable>
      <SearchBar />
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    width: "100%",
    height: 58,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceCardBorder,
    backgroundColor: theme.colors.surface,
    gap: 8,
  },
  backBtn: {
    padding: 6,
  },
});
