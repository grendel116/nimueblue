import { useEffect } from "react";
import { useRouter } from "expo-router";
import { View, StyleSheet } from "react-native";
import { theme } from "@/constants/theme";

export default function NotFoundScreen() {
  const router = useRouter();

  useEffect(() => {
    // If an unknown path (e.g. /android_asset/web/index.html) is loaded,
    // seamlessly redirect to the home screen.
    router.replace("/");
  }, [router]);

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
