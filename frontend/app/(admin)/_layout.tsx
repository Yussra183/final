/**
 * Admin Drawer Layout
 *
 * Uses a Drawer navigator whose `drawerContent` renders the shared
 * `AdminSidebar`. Each route links to the corresponding screen in
 * this `(admin)` folder. The route list mirrors the sidebar's
 * `ADMIN_SIDEBAR_ROUTES` definition so the menu is always in sync.
 */
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
import { AdminSidebar, ADMIN_SIDEBAR_ROUTES } from "../../src/components/admin/AdminSidebar";

const DESKTOP_BREAKPOINT = 900;

/**
 * Drawer body — reuses the AdminSidebar. The sidebar's active-route
 * detection strips group prefixes, so it works correctly inside the
 * `(admin)` group.
 */
function AdminDrawerContent(props: DrawerContentComponentProps) {
  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{
        paddingTop: 0,
        backgroundColor: Colors.background,
      }}
    >
      <AdminSidebar onNavigate={() => props.navigation.closeDrawer()} />
    </DrawerContentScrollView>
  );
}

export default function AdminLayout() {
  const { session } = useStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  if (!session) return <Redirect href="/auth/login" />;
  if (session.user.role !== "admin")
    return <Redirect href={roleHome(session.user.role) as any} />;

  // The visible routes that appear in the drawer — skip header/section
  // entries that don't have a screen of their own.
  const screens = ADMIN_SIDEBAR_ROUTES.filter((r) => !!r.path);

  return (
    <Drawer
      drawerContent={(props) => <AdminDrawerContent {...props} />}
      screenOptions={{
        // Each admin screen renders its own top bar via the
        // AdminLayout component, so we hide the Drawer header.
        headerShown: false,
        drawerStyle: {
          backgroundColor: Colors.background,
          width: 300,
        },
        drawerActiveTintColor: Colors.admin,
        drawerInactiveTintColor: Colors.textSecondary,
        drawerType: "front",
        // On desktop each screen renders its own fixed sidebar via
        // AdminLayout, so we hide the drawer to avoid duplication.
        swipeEnabled: !isDesktop,
      }}
    >
      {screens.map((r) => {
        // Drawer.Screen `name` must match the actual file under this
        // layout folder. Most entries map directly (`key === screenName`),
        // but a few sidebar keys are friendlier than the filename
        // (e.g. "seller-apps" → "seller-applications.tsx"). The
        // `screenName` field on the route record lets us override.
        const screenName = r.screenName ?? r.key;
        return (
          <Drawer.Screen
            key={r.key}
            name={screenName}
            options={{
              title: r.label,
            }}
          />
        );
      })}
    </Drawer>
  );
}
