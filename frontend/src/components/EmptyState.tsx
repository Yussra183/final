import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

interface Props {
  /**
   * Legacy emoji fallback. If `iconName` is provided this is ignored.
   * Kept for backward compatibility with the existing screens.
   */
  icon?: string;
  /**
   * Preferred icon — an Ionicon name. When provided, renders inside a
   * tinted circular bubble instead of a giant emoji, which matches
   * the modernised supplier look.
   */
  iconName?: keyof typeof Ionicons.glyphMap;
  /** Tint color for the icon bubble. Defaults to `Colors.supplier`. */
  iconColor?: string;
  title: string;
  message?: string;
  action?: React.ReactNode;
  style?: ViewStyle;
}

export function EmptyState({
  icon,
  iconName,
  iconColor = Colors.supplier,
  title,
  message,
  action,
  style,
}: Props) {
  return (
    <View style={[styles.wrap, style]}>
      {iconName ? (
        <View
          style={[
            styles.iconBubble,
            { backgroundColor: iconColor + "1A" }, // 10% alpha
          ]}
        >
          <Ionicons name={iconName} size={32} color={iconColor} />
        </View>
      ) : (
        <Text style={styles.icon}>{icon ?? "📦"}</Text>
      )}
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
  iconBubble: {
    width: 72,
    height: 72,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
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
    maxWidth: 320,
  },
});