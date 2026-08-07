/**
 * AdminStatTile — colored KPI tile for the dashboard top row. Displays
 * an icon, label, value and optional trend delta.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../../constants/colors";

export type StatTone =
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "admin"
  | "neutral";

interface Props {
  label: string;
  value: string | number;
  icon: string;
  tone?: StatTone;
  delta?: string; // e.g. "+12%" or "-3"
  deltaTone?: "up" | "down" | "neutral";
}

const TONE_BG: Record<StatTone, string> = {
  primary: "#CCFBF1",
  accent: "#FFEDD5",
  success: "#D1FAE5",
  warning: "#FEF3C7",
  danger: "#FEE2E2",
  info: "#DBEAFE",
  admin: "#E2E8F0",
  neutral: "#F1F5F9",
};

const TONE_TEXT: Record<StatTone, string> = {
  primary: "#0F766E",
  accent: "#C2410C",
  success: "#047857",
  warning: "#B45309",
  danger: "#B91C1C",
  info: "#1D4ED8",
  admin: "#1E293B",
  neutral: "#475569",
};

export function AdminStatTile({
  label,
  value,
  icon,
  tone = "primary",
  delta,
  deltaTone = "neutral",
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View
          style={[styles.iconBubble, { backgroundColor: TONE_BG[tone] }]}
        >
          <Text style={styles.iconText}>{icon}</Text>
        </View>
        {delta ? (
          <View
            style={[
              styles.deltaPill,
              deltaTone === "up" && { backgroundColor: "#D1FAE5" },
              deltaTone === "down" && { backgroundColor: "#FEE2E2" },
            ]}
          >
            <Text
              style={[
                styles.deltaText,
                deltaTone === "up" && { color: Colors.success },
                deltaTone === "down" && { color: Colors.danger },
              ]}
            >
              {deltaTone === "up" ? "▲ " : deltaTone === "down" ? "▼ " : ""}
              {delta}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    ...Shadow.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 18,
  },
  value: {
    fontSize: 22,
    fontWeight: "900",
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: "600",
  },
  deltaPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
  },
  deltaText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
});