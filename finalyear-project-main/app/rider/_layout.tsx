/**
 * Rider Module — Drawer Sidebar Navigation
 *
 * Uses Expo Router's built-in `Drawer` export (`expo-router/drawer`) which
 * wraps `@react-navigation/drawer` with the correct `Screen` component
 * so each file in `app/rider/` becomes a drawer entry.
 *
 * - Route guard: signed-in riders only; everyone else → /auth/login.
 * - Custom sidebar header: branded logo + name above the menu list.
 * - Active item styling uses the rider emerald tone (`Colors.rider`).
 */
import React from "react";
import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import {
  DrawerContentScrollView,
  DrawerItemList,
  type DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

/**
 * Custom sidebar body.
 * Renders the default DrawerItemList (with icons & labels) plus a branded
 * header at the top of the panel.
 */
function RiderDrawerContent(props: DrawerContentComponentProps) {
  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={styles.drawerContent}
    >
      <View style={styles.drawerHeader}>
        <View style={styles.logo}>
          <Text style={styles.logoEmoji}>🛵</Text>
        </View>
        <Text style={styles.brand}>Gas Delivery</Text>
        <Text style={styles.brandSub}>Rider Portal</Text>
      </View>
      <DrawerItemList {...props} />
    </DrawerContentScrollView>
  );
}

export default function RiderLayout() {
  // Route guard — only signed-in riders can enter this module.
  const { session } = useStore();
  if (!session) return <Redirect href="/auth/login" />;
  if (session.user.role !== "rider") return <Redirect href="/auth/login" />;

  // We type the drawer as `any` for the JSX below — the upstream
  // `@react-navigation/drawer` typings require a `children` prop on
  // `Drawer.Screen`, but at runtime Expo Router's `Screen` injects
  // children from the file system, so the prop is never needed.
  const TypedDrawer = Drawer as any;

  return (
    <TypedDrawer
      drawerContent={(props: DrawerContentComponentProps) => <RiderDrawerContent {...props} />}
      screenOptions={{
        // Hide the default navigation header — every screen ships its own
        // branded header (☰ + title + avatar).
        headerShown: false,

        // Active item styling — emerald tone matches the rider role color.
        drawerActiveTintColor: Colors.rider,
        drawerActiveBackgroundColor: "#D1FAE5",
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
        name="delivery-requests"
        options={{
          drawerLabel: "Delivery Requests",
          title: "Delivery Requests",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="download-outline" size={size} color={color} />
          ),
        }}
      />
      <TypedDrawer.Screen
        name="active-delivery"
        options={{
          drawerLabel: "Active Delivery",
          title: "Active Delivery",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="navigate-outline" size={size} color={color} />
          ),
        }}
      />
      <TypedDrawer.Screen
        name="delivery-history"
        options={{
          drawerLabel: "Delivery History",
          title: "Delivery History",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />
      <TypedDrawer.Screen
        name="earnings"
        options={{
          drawerLabel: "Earnings",
          title: "Earnings",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="cash-outline" size={size} color={color} />
          ),
        }}
      />
      <TypedDrawer.Screen
        name="safety-guidelines"
        options={{
          drawerLabel: "Safety Guidelines",
          title: "Safety Guidelines",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="shield-checkmark-outline" size={size} color={color} />
          ),
        }}
      />
      <TypedDrawer.Screen
        name="profile"
        options={{
          drawerLabel: "Profile",
          title: "Profile",
          drawerIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
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
    backgroundColor: Colors.rider,
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
  },
  logoEmoji: { fontSize: 28 },
  brand: {
    color: Colors.textInverse,
    fontSize: FontSize.xl,
    fontWeight: "800",
  },
  brandSub: {
    color: "#D1FAE5",
    fontSize: FontSize.sm,
    marginTop: 2,
  },
});