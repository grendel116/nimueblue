import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { theme } from "@/constants/theme";

type CardVariant = "elevated" | "flat" | "glass";
type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  variant?: CardVariant;
  padding?: CardPadding;
  style?: StyleProp<ViewStyle>;
  accessibilityRole?: "button" | "none";
  accessibilityLabel?: string;
  disabled?: boolean;
}

export function Card({
  children,
  onPress,
  variant = "elevated",
  padding = "md",
  style,
  accessibilityRole,
  accessibilityLabel,
  disabled = false,
}: CardProps) {
  const containerStyle = [
    styles.base,
    styles[variant],
    padding !== "none" && styles[padding],
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole={accessibilityRole ?? "button"}
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          containerStyle,
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={containerStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.lg,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.5,
  },

  // Variants
  elevated: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
  },
  flat: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
  },
  glass: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
  },

  // Paddings
  sm: {
    padding: 12,
  },
  md: {
    padding: 16,
  },
  lg: {
    padding: 24,
  },
});
