import type { ReactNode } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { theme } from "@/constants/theme";

export interface ModalShellProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  children?: ReactNode;
  dismissible?: boolean;
  animationType?: "fade" | "slide" | "none";
  cardStyle?: StyleProp<ViewStyle>;
}

export function ModalShell({
  visible,
  onClose,
  title,
  message,
  children,
  dismissible = true,
  animationType = "fade",
  cardStyle,
}: ModalShellProps) {
  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType={animationType}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={dismissible ? onClose : undefined}
      >
        <Pressable
          style={[styles.card, cardStyle]}
          onPress={(e) => e.stopPropagation?.()}
        >
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.surfaceGlassBorder,
    padding: 20,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  message: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
});
