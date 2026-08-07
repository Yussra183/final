import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewStyle,
} from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

type Variant = "primary" | "secondary" | "accent" | "outline" | "danger" | "ghost";

interface Props extends TouchableOpacityProps {
  title: string;
  variant?: Variant;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
}

const variantStyles: Record<
  Variant,
  { bg: string; border: string; text: string }
> = {
  primary: { bg: Colors.primary, border: Colors.primary, text: "#FFF" },
  secondary: { bg: Colors.secondary, border: Colors.secondary, text: "#FFF" },
  accent: { bg: Colors.accent, border: Colors.accent, text: "#FFF" },
  outline: {
    bg: "transparent",
    border: Colors.primary,
    text: Colors.primary,
  },
  danger: { bg: Colors.danger, border: Colors.danger, text: "#FFF" },
  ghost: { bg: "transparent", border: "transparent", text: Colors.primary },
};

export function AppButton({
  title,
  variant = "primary",
  loading,
  leftIcon,
  rightIcon,
  fullWidth,
  style,
  disabled,
  ...rest
}: Props) {
  const v = variantStyles[variant];
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled || loading}
      {...rest}
      style={[
        styles.base,
        {
          backgroundColor: v.bg,
          borderColor: v.border,
        },
        fullWidth && { alignSelf: "stretch" },
        (disabled || loading) && { opacity: 0.6 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <View style={styles.contentRow}>
          {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
          <Text style={[styles.label, { color: v.text }]}>{title}</Text>
          {rightIcon ? <View style={styles.icon}>{rightIcon}</View> : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  icon: {
    marginHorizontal: 2,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: "700",
  },
});
