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
  const { session } = useStore();
  if (!session) return <Redirect href="/auth/login" />;
  if (session.user.role !== "seller") return <Redirect href="/auth/login" />;

  // We type the drawer as `any` for the JSX below — the upstream
  // `@react-navigation/drawer` typings require a `children` prop on
  // `Drawer.Screen`, but at runtime Expo Router's `Screen` injects
  // children from the file system, so the prop is never needed.
  const TypedDrawer = Drawer as any;

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
        options={{
          drawerLabel: "Orders",
          title: "Orders",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <TypedDrawer.Screen
        name="inventory"
        options={{
          drawerLabel: "Inventory",
          title: "Inventory",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="cube-outline" size={size} color={color} />
          ),
        }}
      />
      <TypedDrawer.Screen
        name="delivery"
        options={{
          drawerLabel: "Delivery Tracking",
          title: "Delivery Tracking",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="car-outline" size={size} color={color} />
          ),
        }}
      />
      <TypedDrawer.Screen
        name="live-tracking"
        options={{
          drawerLabel: "Live Tracking",
          title: "Live Tracking",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="navigate-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <TypedDrawer.Screen
        name="reports"
        options={{
          drawerLabel: "Sales Reports",
          title: "Sales Reports",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
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
    backgroundColor: "#FFFFFF",
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
    color: "#CCFBF1",
    fontSize: FontSize.sm,
    marginTop: 2,
  },
});