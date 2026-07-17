/**
 * src/components/TripTimeline.tsx
 *
 * Vertical stepper showing the 5-step per-stop status lifecycle:
 *   Scheduled → Started → On the way → Near your shop → Delivered
 *
 * Used on the Sellers on Current Route screen to show each stop's
 * current status. The active step is highlighted, completed steps are
 * filled, future steps are muted.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { StopStatus } from "../../constants/types";

interface Props {
  status: StopStatus;
  /** Compact mode (used inside cards) — slightly tighter spacing. */
  compact?: boolean;
}

const STEPS: { key: StopStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "scheduled", label: "Scheduled", icon: "calendar-outline" },
  { key: "started", label: "Started", icon: "play-outline" },
  { key: "on_the_way", label: "On the way", icon: "navigate-outline" },
  { key: "near_shop", label: "Near shop", icon: "location-outline" },
  { key: "delivered", label: "Delivered", icon: "checkmark-circle" },
];

const stepIndex = (s: StopStatus) => STEPS.findIndex((step) => step.key === s);

export function TripTimeline({ status, compact }: Props) {
  const activeIdx = stepIndex(status);
  return (
    <View style={styles.wrap}>
      {STEPS.map((step, idx) => {
        const completed = idx < activeIdx || status === "delivered";
        const active = idx === activeIdx && status !== "delivered";
        const dotColor = completed
          ? Colors.success
          : active
            ? Colors.accent
            : Colors.border;
        const lineColor =
          idx < activeIdx || (idx < STEPS.length - 1 && activeIdx > idx + 1)
            ? Colors.success
            : Colors.border;
        return (
          <View key={step.key} style={styles.row}>
            <View style={styles.gutter}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: dotColor, borderColor: dotColor },
                ]}
              >
                <Ionicons
                  name={step.icon}
                  size={compact ? 9 : 11}
                  color="#FFF"
                />
              </View>
              {idx < STEPS.length - 1 ? (
                <View
                  style={[
                    styles.line,
                    { backgroundColor: lineColor, height: compact ? 18 : 24 },
                  ]}
                />
              ) : null}
            </View>
            <Text
              style={[
                styles.label,
                { color: active || completed ? Colors.text : Colors.textMuted },
                { fontWeight: active ? "800" : "600" },
                compact && { fontSize: 10 },
              ]}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 0,
  },
  gutter: {
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  line: {
    width: 2,
    marginVertical: 1,
  },
  label: {
    fontSize: FontSize.xs,
    paddingTop: 2,
    paddingBottom: 6,
  },
});
