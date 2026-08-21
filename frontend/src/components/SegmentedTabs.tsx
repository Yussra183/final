/**
 * src/components/SegmentedTabs.tsx
 *
 * A pill-style segmented tab bar built on Ionicons (not emojis) so
 * every supplier screen can pivot between sub-sections without each
 * screen re-rolling its own tab chrome.
 *
 * Visual contract:
 *   • Container: full-bleed segmented row inside a transparent wrapper.
 *   • Active tab: brand-accent fill (default `Colors.supplier`),
 *     white label, white icon, subtle raised shadow.
 *   • Inactive tab: transparent background, muted text/icon.
 *   • Press feedback: 0.96× scale via `PressableScale`.
 *
 * Used by every supplier screen that previously had its own inline
 * segmented control (operations, restock, live, fleet).
 */
import React from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { PressableScale } from "./MicroAnimations";

export interface SegmentedTab {
  /** Stable key — passed back via `onChange`. */
  key: string;
  /** Visible label. */
  label: string;
  /** Ionicon name. Rendered at 14 px next to the label. */
  icon?: keyof typeof Ionicons.glyphMap;
}

interface Props {
  tabs: SegmentedTab[];
  active: string;
  onChange: (key: string) => void;
  /**
   * Accent color used for the active tab fill + label color.
   * Defaults to `Colors.supplier` (indigo) so the supplier sidebar
   * stays visually consistent across every screen.
   */
  accent?: string;
  /** Optional override container style (margins etc.). */
  style?: ViewStyle;
  /** Compact variant — smaller height + tighter padding. */
  compact?: boolean;
}

export function SegmentedTabs({
  tabs,
  active,
  onChange,
  accent = Colors.supplier,
  style,
  compact = false,
}: Props) {
  return (
    <View style={[styles.row, compact && styles.rowCompact, style]}>
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <PressableScale
            key={t.key}
            onPress={() => onChange(t.key)}
            style={
              [
                styles.cell,
                isActive
                  ? styles.cellActive
                  : null,
                isActive
                  ? {
                      backgroundColor: accent,
                      shadowColor: accent,
                      shadowOpacity: 0.18,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 2,
                    }
                  : null,
              ] as unknown as ViewStyle
            }
          >
            <View style={styles.inner}>
              {t.icon ? (
                <Ionicons
                  name={t.icon}
                  size={compact ? 13 : 15}
                  color={isActive ? "#FFFFFF" : Colors.textSecondary}
                />
              ) : null}
              <Text
                style={[
                  styles.label,
                  compact && styles.labelCompact,
                  isActive
                    ? styles.labelActive
                    : { color: accent, opacity: 0.85 },
                ]}
              >
                {t.label}
              </Text>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  rowCompact: {
    paddingBottom: Spacing.sm,
    gap: 6,
  },
  cell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  cellCompact: {
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  cellActive: {
    borderColor: "transparent",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  labelCompact: {
    fontSize: FontSize.xs,
  },
  labelActive: {
    color: "#FFFFFF",
    opacity: 1,
  },
});