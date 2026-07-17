import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Card } from "./Card";
import { Colors, FontSize, Spacing } from "../../constants/colors";

interface Props {
  label: string;
  value: string | number;
  icon?: string;
  hint?: string;
  tone?: "primary" | "secondary" | "accent" | "info" | "warning";
  style?: ViewStyle;
}

const toneColors = {
  primary: Colors.primary,
  secondary: Colors.secondary,
  accent: Colors.accent,
  info: Colors.info,
  warning: Colors.warning,
};

export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = "primary",
  style,
}: Props) {
  const accent = toneColors[tone];
  return (
    <Card style={[styles.card, style]}>
      <View style={[styles.iconBox, { backgroundColor: accent + "22" }]}>
        <Text style={[styles.icon, { color: accent }]}>{icon ?? "•"}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: accent }]}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  icon: {
    fontSize: 20,
    fontWeight: "700",
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  value: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    marginTop: 2,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
