/**
 * src/components/SidebarLayout.tsx
 *
 * Responsive wrapper used by the wider supplier screens (Dashboard,
 * Routes, Schedule, Live Map, Reports). On phone-sized viewports it
 * renders the children directly (the Drawer already provides the
 * sidebar via `drawerContent`). On tablet/desktop viewports
 * (≥ 900 px wide) it renders a fixed 280 px sidebar on the left and
 * the children on the right.
 */
import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { SupplierSidebar } from "./SupplierSidebar";

const DESKTOP_BREAKPOINT = 900;

interface Props {
  children: React.ReactNode;
}

export function SidebarLayout({ children }: Props) {
  const { width } = useWindowDimensions();
  if (width >= DESKTOP_BREAKPOINT) {
    return (
      <SafeAreaView
        style={styles.desktopRoot}
        edges={["top", "left", "right"]}
      >
        <View style={styles.desktopSidebar}>
          <SupplierSidebar asPanel />
        </View>
        <View style={styles.desktopContent}>{children}</View>
      </SafeAreaView>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  desktopRoot: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: Colors.background,
  },
  desktopSidebar: {
    width: 280,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  desktopContent: {
    flex: 1,
  },
});