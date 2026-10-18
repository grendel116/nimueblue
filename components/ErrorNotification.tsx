import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "@/constants/theme";

type ErrorNotificationProps = {
  onDismiss: () => void;
  visible: boolean;
  error: Error;
};

const ErrorNotification = ({
  onDismiss,
  visible = true,
  error,
}: ErrorNotificationProps) => {
  if (!visible) return null;

  return (
    <SafeAreaView>
      <View style={[styles.errorNotification]}>
        <Ionicons
          name="alert-circle"
          size={24}
          color={theme.colors.textPrimary}
          style={styles.errorIcon}
        />
        <View style={styles.errorContent}>
          {error.message === "Network request failed" ? (
            <View>
              <Text style={styles.errorTitle}>Connection Issue</Text>
              <Text style={styles.errorMessage}>
                Unable to connect. Check your internet and try again.
              </Text>
            </View>
          ) : (
            <View>
              <Text style={styles.errorTitle}>{error.name}</Text>
              <Text style={styles.errorMessage}>{error.message}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={onDismiss}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={14} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  errorNotification: {
    backgroundColor: theme.colors.danger,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginVertical: 15,
    borderRadius: theme.radius.lg,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: theme.colors.danger,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    width: "80%",
    gap: 5,
  },
  errorIcon: {
    marginRight: 12,
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "600",
    fontSize: 16,
    marginBottom: 2,
  },
  errorMessage: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    opacity: 0.9,
    lineHeight: 16,
  },
  dismissBtn: {
    backgroundColor: theme.colors.overlayLight,
    width: 20,
    height: 20,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default ErrorNotification;
