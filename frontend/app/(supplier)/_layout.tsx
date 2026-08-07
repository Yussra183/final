import React from "react";
import { useWindowDimensions } from "react-native";
import { Drawer } from "expo-router/drawer";
import { Redirect } from "expo-router";
import {
  DrawerContentScrollView,
  DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { Colors } from "../../constants/colors";
import { useStore } from "../../src/store/StoreContext";
import { roleHome } from "../../src/utils/format";
import {
  SupplierSidebar,
  SUPPLIER_SIDEBAR_ROUTES,
} from "../../src/components/SupplierSidebar";

const DESKTOP_BREAKPOINT = 900;

/**
 * Supplier drawer content — delegates to the shared SupplierSidebar
 * component so the sidebar can be reused both as Drawer content and as a
 * standalone in-flow panel.
 */
function SupplierDrawerContent(props: DrawerContentComponentProps) {
  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ paddingTop: 0, backgroundColor: Colors.background }}
    >
      <SupplierSidebar />
    </DrawerContentScrollView>
  );
}

export default function SupplierLayout() {
  const { session } = useStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  if (!session) return <Redirect href="/auth/login" />;
  if (session.user.role !== "supplier")
    return <Redirect href={roleHome(session.user.role) as any} />;

  return (
    <Drawer
      drawerContent={(props) => <SupplierDrawerContent {...props} />}
      screenOptions={{
        // Each supplier screen renders its own header (greeting +
        // DrawerMenuButton + avatar) inside the SafeAreaView, so the
        // Drawer's built-in header would duplicate it on every page.
        // Hide the built-in header on all viewports; on desktop the
        // fixed sidebar replaces it, and on mobile/tablet the page's
        // own header is already there.
        headerShown: false,
        drawerStyle: {
          backgroundColor: Colors.background,
          width: 300,
        },
        drawerActiveTintColor: Colors.supplier,
        drawerInactiveTintColor: Colors.textSecondary,
        drawerType: "front",
        // On desktop the fixed sidebar in each screen duplicates the
        // drawer, so we hide it. The drawer still mounts so the existing
        // routes resolve — we just stop showing the hamburger.
        swipeEnabled: !isDesktop,
      }}
    >
      {SUPPLIER_SIDEBAR_ROUTES.map((r) => (
        <Drawer.Screen
          key={r.key}
          // The Drawer.Screen `name` maps to the file under this layout —
          // every key in SUPPLIER_SIDEBAR_ROUTES is the basename of an
          // existing .tsx file (dashboard, operations, live, fleet,
          // reports, notifications, profile, restock, guide). Nested
          // routes (like routes/[id]) are wired automatically by
          // expo-router.
          name={r.key}
          options={{
            title: r.label,
            headerShown: false,
          }}
        />
      ))}
    </Drawer>
  );
}