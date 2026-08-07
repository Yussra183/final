/**
 * AdminButton — primary/secondary/ghost/danger variants used across
 * admin pages. Matches the modern, professional tone required by the
 * dashboard brief.
 */
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../../constants/colors";

export type AdminButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success"
  | "warning";

interface Props {
  label: string;
  onPress?: () => void;
  variant?: AdminButtonVariant;
  icon?: string;
  size?: "sm" | "md";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle | ViewStyle[];
}

export function AdminButton({
  label,
  onPress,
  variant = "primary",
  icon,
  size = "md",
  loading,
  disabled,
  fullWidth,
  style,
}: Props) {
  const visual = VARIANT[variant];

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.base,
        size === "sm" ? styles.sizeSm : styles.sizeMd,
        {
          backgroundColor: visual.bg,
          borderColor: visual.border,
        },
        variant === "primary" && Shadow.card,
        disabled && { opacity: 0.55 },
        fullWidth && { alignSelf: "stretch" },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={visual.text} size="small" />
      ) : (
        <View style={styles.inner}>
          {icon ? (
            <Text style={[styles.icon, { color: visual.text }]}>{icon}</Text>
          ) : null}
          <Text style={[styles.text, { color: visual.text }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const VARIANT: Record<
  AdminButtonVariant,
  { bg: string; text: string; border: string }
> = {
  primary: {
    bg: Colors.admin,
    text: "#FFFFFF",
    border: Colors.admin,
  },
  secondary: {
    bg: Colors.surface,
    text: Colors.text,
    border: Colors.border,
  },
  ghost: {
    bg: "transparent",
    text: Colors.text,
    border: "transparent",
  },
  danger: {
    bg: Colors.danger,
    text: "#FFFFFF",
    border: Colors.danger,
  },
  success: {
    bg: Colors.success,
    text: "#FFFFFF",
    border: Colors.success,
  },
  warning: {
    bg: Colors.warning,
    text: "#FFFFFF",
    border: Colors.warning,
  },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sizeMd: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  sizeSm: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    fontSize: FontSize.sm,
    marginRight: 6,
  },
  text: {
    fontSize: FontSize.sm,
    fontWeight: "800",
  },
});