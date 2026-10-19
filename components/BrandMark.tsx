import { View, Image, StyleSheet } from "react-native";

// The vectorized NIMUEBLUE logo mark and two-tone wordmark
export default function BrandMark() {
  return (
    <View style={styles.brandRow}>
      <Image
        source={require("@/assets/images/nimue-text-logo.png")}
        style={styles.logoImage}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="NimueBlue"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoImage: {
    height: 28,
    width: 148,
  },
});

