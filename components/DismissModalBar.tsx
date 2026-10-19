import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";
import BrandMark from "@/components/BrandMark";

export default function DismissModalBar({
  onPress,
  locked = false,
}: {
  onPress?: () => void;
  locked?: boolean;
}) {
  const router = useRouter();

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={
          locked
            ? undefined
            : (onPress ?? (() => (router.canDismiss() ? router.dismiss() : router.replace("/"))))
        }
        disabled={locked}
        style={styles.pressable}
        accessibilityRole="button"
        accessibilityLabel={locked ? "Locked until phone is online" : "Dismiss modal"}
      >
        <Ionicons
          name={locked ? "lock-closed-outline" : "chevron-down"}
          size={locked ? 20 : 26}
          color={locked ? theme.colors.textMuted : theme.colors.textSecondary}
          style={styles.chevron}
        />
        <BrandMark />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: "100%",
    height: 48,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceCardBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  pressable: {
    width: "100%",
    height: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  chevron: {
    position: "absolute",
    left: 16,
  },
});

