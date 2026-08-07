import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

interface Props {
  label: string;
  tone?: "primary" | "success" | "warning" | "danger" | "info" | "muted";
  style?: ViewStyle;
}

const toneMap = {
  primary: { bg: "#CCFBF1", fg: Colors.primary },
  success: { bg: "#DCFCE7", fg: "#047857" },
  warning: { bg: "#FEF3C7", fg: "#B45309" },
  danger: { bg: "#FEE2E2", fg: "#B91C1C" },
  info: { bg: "#DBEAFE", fg: "#1D4ED8" },
  muted: { bg: "#E2E8F0", fg: Colors.textSecondary },
};

export function StatusPill({ label, tone = "primary", style }: Props) {
  const t = toneMap[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    textTransform: "capitalize",
  },
});
