import { View, Text, Image, StyleSheet } from "react-native";
import { theme } from "@/constants/theme";

// The NIMUEBLUE logo and two-tone wordmark
export default function BrandMark() {
  return (
    <View style={styles.brandRow}>
      <Image
        source={require("@/assets/images/nimue-blue-logo.png")}
        style={styles.logoImage}
        resizeMode="contain"
      />
      <View style={styles.brandWordmark}>
        <Text style={styles.brandText}>NIMUE</Text>
        <Text style={[styles.brandText, styles.brandHighlight]}>BLUE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  logoImage: {
    width: 28,
    height: 28,
    tintColor: theme.colors.logo,
  },
  brandWordmark: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandText: {
    fontFamily: theme.fonts.display,
    fontSize: 18,
    fontWeight: "normal",
    color: theme.colors.textPrimary,
    letterSpacing: 0.8,
  },
  brandHighlight: {
    color: theme.colors.primary,
    paddingRight: 2,
  },
});
