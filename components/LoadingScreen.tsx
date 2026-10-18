import { StyleSheet, View } from "react-native";
import { theme } from "@/constants/theme";
import DropletSpinner from "./DropletSpinner";

// Full-screen loading state: a centered swirling droplet spinner on the app background
export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <DropletSpinner size={52} color={theme.colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
