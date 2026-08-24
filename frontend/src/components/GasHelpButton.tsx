import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors, Radius } from "../../constants/colors";

interface GasHelpButtonProps {
  /**
   * Optional override for the destination route. Defaults to the
   * shared `/gas-help` route introduced for the cross-role gas-safety
   * feature.
   */
  to?: string;
  /**
   * Tint color for the icon. Defaults to the brand primary so the
   * button reads consistently across every role header.
   */
  tint?: string;
  /**
   * Background tint behind the icon. Defaults to the soft primary so
   * the button matches the existing notification bell button used on
   * the customer header.
   */
  background?: string;
  /**
   * Visual size preset — `compact` matches the small bell button
   * used on the customer tabs; `header` matches the larger icon
   * buttons used on the seller/supplier/rider headers.
   */
  size?: "compact" | "header";
}

/**
 * Gas Help / Safety guide button.
 *
 * Single-purpose header button that opens the cross-role "Gas Safety &
 * Help" screen. Reused by every non-admin role header so the entry
 * point looks and behaves identically.
 *
 * Uses the project's existing Ionicons set (`help-circle` outline) so
 * no new icon dependency is introduced. The accessibility label is
 * explicit so the icon is never the only indication of the action.
 */
export function GasHelpButton({
  to = "/gas-help",
  tint = Colors.primary,
  background = "#CCFBF1",
  size = "compact",
}: GasHelpButtonProps) {
  const router = useRouter();

  const dims = size === "header" ? styles.headerBtn : styles.compactBtn;

  return (
    <TouchableOpacity
      accessibilityLabel="Open Gas Safety and Help"
      accessibilityRole="button"
      style={[dims, { backgroundColor: background }]}
      onPress={() => router.push(to as any)}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="help-circle" size={size === "header" ? 22 : 20} color={tint} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  compactBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});