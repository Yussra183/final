/**
 * AdminBadge — small colored pill used for status indicators.
 * Variants: success, warning, danger, info, neutral, primary, accent.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors, FontSize, Radius } from "../../../constants/colors";

export type BadgeTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "primary"
  | "accent";

const BG: Record<BadgeTone, string> = {
  success: "#D1FAE5",
  warning: "#FEF3C7",
  danger: "#FEE2E2",
  info: "#DBEAFE",
  neutral: "#E2E8F0",
  primary: "#CCFBF1",
  accent: "#FFEDD5",
};

const TEXT: Record<BadgeTone, string> = {
  success: "#047857",
  warning: "#B45309",
  danger: "#B91C1C",
  info: "#1D4ED8",
  neutral: "#475569",
  primary: "#0F766E",
  accent: "#C2410C",
};

interface Props {
  label: string;
  tone?: BadgeTone;
  icon?: string;
}

export function AdminBadge({ label, tone = "neutral", icon }: Props) {
  return (
    <View style={[styles.pill, { backgroundColor: BG[tone] }]}>
      {icon ? <Text style={[styles.icon, { color: TEXT[tone] }]}>{icon}</Text> : null}
      <Text style={[styles.text, { color: TEXT[tone] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    alignSelf: "flex-start",
  },
  icon: {
    fontSize: 11,
    marginRight: 4,
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});