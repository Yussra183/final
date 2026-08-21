/**
 * AdminTabs — pill-style segmented tab bar for use inside Admin pages.
 *
 * Built on Ionicons (not emojis) so every modernised tab stays visually
 * consistent with the rest of the Admin design vocabulary. The
 * `icon` field is interpreted through the shared admin icon map so
 * tab icons match the icons used in the sidebar and the related
 * quick actions.
 */
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../../constants/colors";
import { PressableScale } from "../MicroAnimations";
import { AdminIconName, adminIconGlyph } from "./Icon";

export interface AdminTab {
  /** Stable key — passed back via `onChange`. */
  key: string;
  /** Visible label. */
  label: string;
  /** Editorial icon name. Rendered at 14 px to the left of the label. */
  icon?: AdminIconName;
  /** Optional badge shown to the right of the label (e.g. queue count). */
  count?: number;
}

interface Props {
  tabs: AdminTab[];
  active: string;
  onChange: (key: string) => void;
  /** Accent color for the active tab fill. Defaults to admin (slate-800). */
  accent?: string;
}

export function AdminTabs({
  tabs,
  active,
  onChange,
  accent = Colors.admin,
}: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.wrap}
    >
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <PressableScale
            key={t.key}
            onPress={() => onChange(t.key)}
            style={
              [
                styles.cell,
                isActive && {
                  backgroundColor: accent,
                  borderColor: accent,
                  shadowColor: accent,
                  shadowOpacity: 0.18,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                },
              ] as any
            }
          >
            <View style={styles.inner}>
              {t.icon ? (
                <Ionicons
                  name={adminIconGlyph(t.icon)}
                  size={14}
                  color={isActive ? "#FFFFFF" : Colors.textSecondary}
                />
              ) : null}
              <Text
                style={[
                  styles.label,
                  isActive ? styles.labelActive : { color: accent, opacity: 0.85 },
                ]}
              >
                {t.label}
              </Text>
              {typeof t.count === "number" && t.count > 0 ? (
                <View
                  style={[
                    styles.countBadge,
                    isActive && styles.countBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.countText,
                      isActive && styles.countTextActive,
                    ]}
                  >
                    {t.count}
                  </Text>
                </View>
              ) : null}
            </View>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: Spacing.md,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  cell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Shadow.card,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  labelActive: {
    color: "#FFFFFF",
    opacity: 1,
  },
  countBadge: {
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 7,
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  countBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  countText: {
    fontSize: 10,
    fontWeight: "900",
    color: Colors.textSecondary,
  },
  countTextActive: {
    color: "#FFFFFF",
  },
});
