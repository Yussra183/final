/**
 * src/components/StopStatusPill.tsx
 *
 * Status pill for `RouteStop.status`. Mirrors the lifecycle described in
 * the product brief:
 *
 *   scheduled  →  Scheduled
 *   started    →  Started
 *   on_the_way →  On the way
 *   near_shop  →  Near your shop
 *   delivered  →  Delivered
 */
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { StopStatus } from "../../constants/types";

interface Props {
  status: StopStatus;
  style?: ViewStyle;
}

const toneMap: Record<
  StopStatus,
  { bg: string; fg: string; label: string }
> = {
  scheduled: { bg: "#E2E8F0", fg: Colors.textSecondary, label: "Scheduled" },
  started: { bg: "#CCFBF1", fg: Colors.primary, label: "Started" },
  on_the_way: { bg: "#DBEAFE", fg: "#1D4ED8", label: "On the way" },
  near_shop: { bg: "#FED7AA", fg: "#9A3412", label: "Near your shop" },
  delivered: { bg: "#DCFCE7", fg: "#047857", label: "Delivered" },
};

export function StopStatusPill({ status, style }: Props) {
  const t = toneMap[status];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      <Text style={[styles.text, { color: t.fg }]}>{t.label}</Text>
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
  },
});
