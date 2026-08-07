/**
 * DrawerMenuButton — a compact "hamburger" button that opens the parent
 * Drawer navigator. Drop into a `ScreenHeader` `left` slot to give a
 * screen an explicit menu affordance in addition to the edge-swipe
 * gesture.
 */
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { DrawerNavigationProp } from "@react-navigation/drawer";
import { Colors, Radius, Spacing } from "../../constants/colors";

export function DrawerMenuButton({
  tint = Colors.text,
}: {
  /** Color applied to the three lines. Defaults to the body text color. */
  tint?: string;
}) {
  // We type the navigation handle as `any` because the parent navigator
  // type isn't known at the component level — only that `openDrawer` is
  // available, which is all we call.
  const navigation = useNavigation<DrawerNavigationProp<any>>();

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Open menu"
      onPress={() => navigation.openDrawer()}
      style={styles.btn}
    >
      <View style={styles.lines}>
        <View style={[styles.line, { backgroundColor: tint }]} />
        <View style={[styles.line, { backgroundColor: tint }]} />
        <View style={[styles.line, { backgroundColor: tint }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
  },
  lines: { width: 18, gap: 3 },
  line: { height: 2, borderRadius: 1 },
});
