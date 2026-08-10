import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Spacing } from "../../../constants/colors";
import { HapticTab } from "../../../components/haptic-tab";

/**
 * Customer bottom-tab navigator.
 *
 * Three top-level destinations:
 *   • Home       — map + nearby sellers
 *   • My Orders  — segmented Active/Past history
 *   • Profile    — editable profile + Log out
 *
 * Secondary routes (`tracking`, `seller/[id]`, `notifications`, etc.)
 * live in the parent Stack at `(customer)/_layout.tsx` and push over
 * the tabs — the tab bar is hidden automatically on push.
 *
 * Haptic feedback on tab press is provided by `HapticTab` (iOS only)
 * for parity with the other tabs in the app.
 */
export default function CustomerTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: Spacing.xs,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: FontSize.xs,
          fontWeight: "700",
        },
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "My Orders",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
