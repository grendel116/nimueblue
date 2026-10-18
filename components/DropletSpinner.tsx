import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { theme } from "@/constants/theme";

interface DropletSpinnerProps {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export default function DropletSpinner({
  size = 36,
  color = theme.colors.primary,
  style,
}: DropletSpinnerProps) {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 850,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={[styles.container, style]} accessibilityRole="progressbar">
      <Animated.Image
        source={require("@/assets/images/swirling-droplet.png")}
        style={[
          {
            width: size,
            height: size,
            transform: [{ rotate: spin }],
            tintColor: color,
          },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
});
