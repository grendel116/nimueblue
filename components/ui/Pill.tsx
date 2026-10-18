import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];
type PillVariant = "default" | "tag" | "accent";
type PillSize = "sm" | "md";

export interface PillProps {
  label: string;
  active?: boolean;
  icon?: IconName;
  count?: number | string;
  detail?: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  size?: PillSize;
  variant?: PillVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export function Pill({
  label,
  active = false,
  icon,
  count,
  detail,
  onPress,
  loading = false,
  disabled = false,
  size = "md",
  variant = "default",
  style,
  textStyle,
  accessibilityLabel,
}: PillProps) {
  const isInteractive = !disabled && !loading && !!onPress;

  const textColor = (() => {
    if (active) return theme.colors.playButtonIcon;
    if (variant === "tag") return theme.colors.textCyan;
    if (variant === "accent") return theme.colors.primary;
    return theme.colors.textSecondary;
  })();

  const iconColor = active ? theme.colors.playButtonIcon : theme.colors.primary;
  const iconSize = size === "sm" ? 13 : 15;

  return (
    <Pressable
      onPress={onPress}
      disabled={!isInteractive}
      accessibilityRole={onPress ? (active !== undefined ? "tab" : "button") : "text"}
      accessibilityState={{ selected: active, disabled: !isInteractive, busy: loading }}
      accessibilityLabel={
        accessibilityLabel ??
        (count !== undefined ? `${label} (${count})` : detail ? `${label}, ${detail}` : label)
      }
      style={({ pressed }) => [
        styles.base,
        styles[size],
        active && styles.active,
        disabled && styles.disabled,
        pressed && isInteractive && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} style={styles.spinner} />
      ) : icon ? (
        <Ionicons name={icon} size={iconSize} color={iconColor} />
      ) : null}

      <Text
        style={[
          styles.label,
          styles[`${size}Text`],
          { color: textColor },
          active && styles.activeText,
          textStyle,
        ]}
      >
        {label}
      </Text>

      {count !== undefined && count !== null ? (
        <Text style={[styles.count, { color: textColor }]}>({count})</Text>
      ) : null}

      {detail ? (
        <Text
          style={[
            styles.detail,
            { color: active ? theme.colors.playButtonIcon : theme.colors.textSecondary },
          ]}
        >
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    backgroundColor: theme.colors.surfaceElevated,
  },
  sm: {
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  md: {
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  active: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.45,
  },
  spinner: {
    width: 14,
    height: 14,
  },
  label: {
    fontWeight: "600",
  },
  smText: {
    fontSize: 12,
  },
  mdText: {
    fontSize: 13,
  },
  activeText: {
    fontWeight: "700",
  },
  count: {
    fontSize: 12,
    fontWeight: "600",
  },
  detail: {
    fontSize: 12,
  },
});
