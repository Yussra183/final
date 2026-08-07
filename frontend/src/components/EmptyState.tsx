import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Colors, FontSize, Spacing } from "../../constants/colors";

interface Props {
  icon?: string;
  title: string;
  message?: string;
  action?: React.ReactNode;
  style?: ViewStyle;
}

export function EmptyState({
  icon = "📦",
  title,
  message,
  action,
  style,
}: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action ? <View style={{ marginTop: Spacing.md }}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  icon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 4,
    textAlign: "center",
  },
  message: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});
