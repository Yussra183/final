/**
 * Seller Module — Drawer Sidebar Navigation
 *
 * Uses Expo Router's built-in `Drawer` export (`expo-router/drawer`) which
 * wraps `@react-navigation/drawer` with the correct `Screen` component
 * so each file in `app/seller/` becomes a drawer entry.
 *
 * - Route guard: signed-in sellers only; everyone else → /auth/login.
 * - Custom sidebar header: branded logo + name above the menu list.
 */
import React from "react";
import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import {
  DrawerContentScrollView,
  DrawerItemList,
  type DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { View, Text, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

const LOGO = require("../../assets/images/icon.png");

/**
 * Custom sidebar body.
 * Renders the default DrawerItemList (with icons & labels) plus a branded
 * header at the top of the panel.
 */
function SellerDrawerContent(props: DrawerContentComponentProps) {
  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={styles.drawerContent}
    >
      <View style={styles.drawerHeader}>
        <View style={styles.logo}>
          <Image
            source={LOGO}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityLabel="Gas Delivery and Supply logo"
          />
        </View>
        <Text style={styles.brand}>Gas Delivery</Text>
        <Text style={styles.brandSub}>Seller Portal</Text>
      </View>
      <DrawerItemList {...props} />
    </DrawerContentScrollView>
  );
}

export default function SellerLayout() {
  // Route guard — only signed-in sellers can enter this module.
  const { session, sellerPermits } = useStore();
  if (!session) return <Redirect href="/auth/login" />;
  if (session.user.role !== "seller") return <Redirect href="/auth/login" />;

  /**
   * Permit gating: until the seller's permit is APPROVED every
   * business-facing drawer item is disabled. The seller can still see
   * the dashboard, profile (where they apply), and notifications —
   * everything else is greyed out with a "pending verification" tooltip.
   *
   * `session.user.permitStatus` is the source of truth; it mirrors the
   * server's view after every `refresh()` cycle. We also peek the
   * `sellerPermits` map as a fallback for the very first render before
   * the session has been hydrated.
   */
  const permitStatus =
    session.user.permitStatus ??
    sellerPermits[session.user.id]?.status ??
    null;
  const permitApproved = permitStatus === "approved";

  // We type the drawer as `any` for the JSX below — the upstream
  // `@react-navigation/drawer` typings require a `children` prop on
  // `Drawer.Screen`, but at runtime Expo Router's `Screen` injects
  // children from the file system, so the prop is never needed.
  const TypedDrawer = Drawer as any;

  /**
   * Drawer entry helper — wraps the standard option block with a
   * `disabled` flag and a small lock icon when the seller isn't
   * approved. Stays a single line at each call site.
   */
  const businessOptions = (label: string, title: string, icon: keyof typeof Ionicons.glyphMap) => ({
    drawerLabel: permitApproved ? label : `${label} (locked)`,
    title,
    drawerIcon: ({ color, size }: { color: string; size: number }) => (
      <Ionicons
        name={permitApproved ? icon : "lock-closed-outline"}
        size={size}
        color={color}
      />
    ),
    swipeEnabled: permitApproved,
    drawerItemStyle: permitApproved ? undefined : { opacity: 0.5 },
  });

  return (
    <TypedDrawer
      drawerContent={(props: DrawerContentComponentProps) => <SellerDrawerContent {...props} />}
      screenOptions={{
        // Hide the default navigation header — every screen ships its own
        // branded header (☰ + title + logout).
        headerShown: false,

        // Active item styling
        drawerActiveTintColor: Colors.primary,
        drawerActiveBackgroundColor: "#CCFBF1",
        drawerInactiveTintColor: Colors.text,

        // Drawer panel
        drawerStyle: {
          backgroundColor: Colors.surface,
          width: 280,
        },
        drawerLabelStyle: {
          fontSize: FontSize.md,
          fontWeight: "700",
          marginLeft: -8,
        },
        drawerItemStyle: {
          borderRadius: Radius.md,
          marginVertical: 2,
          paddingHorizontal: Spacing.sm,
        },

        // Smooth slide animation
        drawerType: "slide",
      }}
    >
      <TypedDrawer.Screen
        name="dashboard"
        options={{
          drawerLabel: "Dashboard",
          title: "Dashboard",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <TypedDrawer.Screen
        name="orders"
        options={businessOptions("Orders", "Orders", "receipt-outline")}
      />
      <TypedDrawer.Screen
        name="inventory"
        options={businessOptions("Inventory", "Inventory", "cube-outline")}
      />
      <TypedDrawer.Screen
        name="delivery"
        options={businessOptions(
          "Delivery Tracking",
          "Delivery Tracking",
          "car-outline",
        )}
      />
      <TypedDrawer.Screen
        name="live-tracking"
        options={businessOptions(
          "Live Tracking",
          "Live Tracking",
          "navigate-circle-outline",
        )}
      />
      <TypedDrawer.Screen
        name="reports"
        options={businessOptions("Sales Reports", "Sales Reports", "bar-chart-outline")}
      />
      <TypedDrawer.Screen
        name="profile"
        options={{
          drawerLabel: "Shop Profile",
          title: "Shop Profile",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="storefront-outline" size={size} color={color} />
          ),
        }}
      />
      <TypedDrawer.Screen
        name="licences"
        options={{
          drawerLabel: "Licences",
          title: "Licences",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <TypedDrawer.Screen
        name="notifications"
        options={{
          drawerLabel: "Notifications",
          title: "Notifications",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />
    </TypedDrawer>
  );
}

const styles = StyleSheet.create({
  drawerContent: {
    paddingTop: 0,
  },
  drawerHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    backgroundColor: Colors.primary,
    marginBottom: Spacing.md,
    marginHorizontal: 0,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  logoEmoji: { fontSize: 28 },
  brand: {
    color: Colors.textInverse,
    fontSize: FontSize.xl,
    fontWeight: "800",
  },
  brandSub: {
    color: Colors.primarySoft,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
});