import type { ComponentProps, ReactNode } from "react";
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
type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  label?: string;
  children?: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: "left" | "right";
  loading?: boolean;
  disabled?: boolean;
  rounded?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export function Button({
  label,
  children,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  loading = false,
  disabled = false,
  rounded = false,
  fullWidth = false,
  style,
  textStyle,
  accessibilityLabel,
}: ButtonProps) {
  const isInteractive = !disabled && !loading && !!onPress;

  const contentColor = (() => {
    switch (variant) {
      case "primary":
        return theme.colors.playButtonIcon;
      case "destructive":
        return theme.colors.danger;
      case "secondary":
        return theme.colors.textPrimary;
      case "ghost":
        return theme.colors.textSecondary;
    }
  })();

  const iconColor = (() => {
    switch (variant) {
      case "primary":
        return theme.colors.playButtonIcon;
      case "destructive":
        return theme.colors.danger;
      case "secondary":
        return theme.colors.primary;
      case "ghost":
        return theme.colors.textSecondary;
    }
  })();

  const iconSize = size === "sm" ? 14 : size === "lg" ? 20 : 18;

  return (
    <Pressable
      onPress={onPress}
      disabled={!isInteractive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !isInteractive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles[size],
        styles[variant],
        rounded && styles.rounded,
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        pressed && isInteractive && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={contentColor} />
      ) : (
        <>
          {icon && iconPosition === "left" ? (
            <Ionicons name={icon} size={iconSize} color={iconColor} />
          ) : null}
          {label ? (
            <Text
              style={[
                styles.labelBase,
                styles[`${size}Text`],
                styles[`${variant}Text`],
                textStyle,
              ]}
            >
              {label}
            </Text>
          ) : (
            children
          )}
          {icon && iconPosition === "right" ? (
            <Ionicons name={icon} size={iconSize} color={iconColor} />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: theme.radius.md,
  },
  rounded: {
    borderRadius: theme.radius.full,
  },
  fullWidth: {
    width: "100%",
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.45,
  },

  // Sizes
  sm: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    minHeight: 32,
  },
  md: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  lg: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 48,
  },

  // Variants
  primary: {
    backgroundColor: theme.colors.primary,
  },
  secondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  destructive: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },

  // Text sizes
  smText: {
    fontSize: 13,
  },
  mdText: {
    fontSize: 14,
  },
  lgText: {
    fontSize: 16,
  },

  // Text variants
  labelBase: {
    fontWeight: "700",
  },
  primaryText: {
    color: theme.colors.playButtonIcon,
  },
  secondaryText: {
    color: theme.colors.textPrimary,
  },
  ghostText: {
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },
  destructiveText: {
    color: theme.colors.danger,
  },
});
