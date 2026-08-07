/**
 * Rider Module — Drawer Sidebar Navigation
 *
 * Uses Expo Router's built-in `Drawer` export (`expo-router/drawer`) with
 * a fully custom sidebar body. Each menu entry stays visible for every
 * rider — new, pending, rejected and approved riders all see the same
 * menu. Locked entries:
 *
 *   • render with a 🔒 lock icon on the right
 *   • are tinted at 50% opacity (matching the supplier sidebar)
 *   • still navigate to the destination when tapped (so the rider can
 *     preview the page) instead of forwarding to Profile
 *
 * Individual page bodies wrap their interactive bits in
 * {@link RiderAccessGate} for the per-page banner + tap-to-modal UX.
 */
import React from "react";
import { Redirect, useRouter, usePathname } from "expo-router";
import { Drawer } from "expo-router/drawer";
import {
  DrawerContentScrollView,
  type DrawerContentComponentProps,
  type DrawerItem,
} from "@react-navigation/drawer";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { useRiderVerificationStatus } from "../../src/hooks/useRiderVerificationStatus";

interface RiderRoute {
  key: string;
  label: string;
  icon: string;
  path: string;
  /**
   * Rider *business* features stay locked until the admin approves the
   * application. Account-level routes (Dashboard, Notifications,
   * Profile, Safety Guidelines) are always reachable.
   */
  requiresApproval?: boolean;
}

const RIDER_ROUTES: RiderRoute[] = [
  { key: "dashboard", label: "Dashboard", icon: "grid-outline", path: "/rider/dashboard" },
  { key: "delivery-requests", label: "Delivery Requests", icon: "download-outline", path: "/rider/delivery-requests", requiresApproval: true },
  { key: "active-delivery", label: "Active Delivery", icon: "navigate-outline", path: "/rider/active-delivery", requiresApproval: true },
  { key: "delivery-history", label: "Delivery History", icon: "time-outline", path: "/rider/delivery-history", requiresApproval: true },
  { key: "earnings", label: "Earnings", icon: "cash-outline", path: "/rider/earnings", requiresApproval: true },
  { key: "my-team", label: "My Team", icon: "people-outline", path: "/rider/my-team", requiresApproval: true },
  { key: "safety-guidelines", label: "Safety Guidelines", icon: "shield-checkmark-outline", path: "/rider/safety-guidelines" },
  { key: "profile", label: "Profile", icon: "person-circle-outline", path: "/rider/profile" },
];

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  "grid-outline": "grid-outline",
  "download-outline": "download-outline",
  "navigate-outline": "navigate-outline",
  "time-outline": "time-outline",
  "cash-outline": "cash-outline",
  "people-outline": "people-outline",
  "shield-checkmark-outline": "shield-checkmark-outline",
  "person-circle-outline": "person-circle-outline",
};

/**
 * Custom sidebar body.
 * Renders the menu rows directly (icons + labels + lock indicator) and
 * a branded header at the top of the panel.
 */
function RiderDrawerContent(props: DrawerContentComponentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useStore();
  const user = session?.user;
  // Approval status drives the lock affordance on each row.
  const verification = useRiderVerificationStatus();
  const isApproved = verification.isApproved;

  const isActive = (target: string) => {
    const norm = (s: string) => s.replace(/^\/rider\/?/, "");
    const a = norm(target);
    const p = norm(pathname ?? "");
    if (a === "") return p === "";
    return p.startsWith(a);
  };

  const handlePress = (path: string) => {
    router.push(path as any);
    props.navigation.closeDrawer?.();
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={styles.drawerContent}>
      <View style={styles.drawerHeader}>
        <View style={styles.logo}>
          <Text style={styles.logoEmoji}>🛵</Text>
        </View>
        <Text style={styles.brand}>Gas Delivery</Text>
        <Text style={styles.brandSub}>Rider Portal</Text>
      </View>

      <ScrollView contentContainerStyle={styles.menuSection}>
        {RIDER_ROUTES.map((r) => {
          const active = isActive(r.path);
          const locked = !!r.requiresApproval && !isApproved;
          const iconName = ICON_MAP[r.icon] ?? "ellipse-outline";
          return (
            <TouchableOpacity
              key={r.key}
              activeOpacity={0.85}
              onPress={() => handlePress(r.path)}
              style={[
                styles.menuRow,
                active && styles.menuRowActive,
                locked && styles.menuRowLocked,
              ]}
            >
              <View
                style={[
                  styles.iconBubble,
                  active && { backgroundColor: Colors.rider },
                ]}
              >
                <Ionicons
                  name={iconName}
                  size={18}
                  color={active ? "#FFF" : Colors.text}
                />
              </View>
              <Text
                style={[
                  styles.menuLabel,
                  active && { color: Colors.rider, fontWeight: "800" },
                ]}
              >
                {r.label}
              </Text>
              {locked ? <Text style={styles.lockIcon}>🔒</Text> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
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
      drawerContent={(props: DrawerContentComponentProps) => (
        <RiderDrawerContent {...props} />
      )}
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: Colors.surface,
          width: 280,
        },
        drawerType: "slide",
      }}
    >
      <TypedDrawer.Screen name="dashboard" />
      <TypedDrawer.Screen name="delivery-requests" />
      <TypedDrawer.Screen name="active-delivery" />
      <TypedDrawer.Screen name="delivery-history" />
      <TypedDrawer.Screen name="earnings" />
      <TypedDrawer.Screen name="safety-guidelines" />
      <TypedDrawer.Screen name="my-team" />
      <TypedDrawer.Screen name="profile" />
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
  menuSection: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    marginVertical: 2,
    gap: Spacing.md,
  },
  menuRowActive: {
    backgroundColor: "#D1FAE5",
  },
  menuRowLocked: {
    opacity: 0.5,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceMuted,
  },
  menuLabel: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
    flex: 1,
  },
  lockIcon: {
    fontSize: 13,
  },
});
