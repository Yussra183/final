import React from "react";
import { Text, View } from "react-native";
import { Drawer } from "expo-router/drawer";
import { Redirect } from "expo-router";
import {
  DrawerContentScrollView,
  DrawerContentComponentProps,
  DrawerItem,
} from "@react-navigation/drawer";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../constants/colors";
import { useStore } from "../../src/store/StoreContext";
import { Avatar } from "../../src/components/Avatar";
import { roleHome } from "../../src/utils/format";
import { PulseDot } from "../../src/components/MicroAnimations";

type DrawerRoute = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  path: string;
};

/**
 * Customer drawer entries. We rely on `@expo/vector-icons` (`Ionicons`)
 * for clean, professional icons — the previous emoji-based icons have
 * been replaced so the menu reads as one consistent design system.
 */
const DRAWER_ROUTES: DrawerRoute[] = [
  { key: "home", label: "Home", icon: "home-outline", path: "/(customer)" },
  {
    key: "orders",
    label: "My Orders",
    icon: "cube-outline",
    path: "/(customer)/orders",
  },
  {
    key: "profile",
    label: "Profile",
    icon: "person-circle-outline",
    path: "/(customer)/profile",
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: "notifications-outline",
    path: "/(customer)/notifications",
  },
  {
    key: "safety",
    label: "Safety & Alerts",
    icon: "shield-checkmark-outline",
    path: "/(customer)/safety",
  },
];

/**
 * Simplified customer drawer content. Shows the customer's avatar +
 * username at the top and a focused list of navigation rows: Home,
 * Orders, Profile, Notifications, and Safety & Alerts.
 *
 * PERSISTENCE — Why the sidebar does not flicker.
 * ----------------------------------------------
 * `Drawer` from `expo-router/drawer` mounts the drawer navigator once
 * at this layout level and persists it for the lifetime of the parent
 * route group. Nested `Drawer.Screen` entries swap the active route in
 * place rather than re-mounting the navigator, so the sidebar (this
 * component) keeps its scroll position, the customer's session, and
 * any in-memory timers between page transitions. Each screen also has
 * `headerShown: false` so it can render its own header within the
 * stable drawer shell.
 */
function CustomerDrawerContent(
  props: DrawerContentComponentProps,
) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, getNotificationsForUser } = useStore();
  const user = session?.user;

  // Unread notifications drive the small pulsing badge next to the
  // "Notifications" row — gives the sidebar a glanceable signal that
  // mirrors the red dot used elsewhere in the app.
  const unreadCount = user
    ? getNotificationsForUser(user.id).filter((n) => !n.read).length
    : 0;

  const isActive = (target: string) => {
    // Strip group prefixes for comparison.
    const norm = (s: string) => s.replace(/^\/\([^)]+\)/, "");
    const a = norm(target);
    const p = norm(pathname ?? "");
    if (a === "") return p === "" || p === "/index";
    return p.startsWith(a);
  };

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ paddingTop: 0, backgroundColor: Colors.background }}
    >
      <View style={styles.drawerHeader}>
        <Avatar name={user?.fullName ?? "Customer"} size={64} />
        <Text style={styles.drawerName}>{user?.fullName ?? "Customer"}</Text>
        <Text style={styles.drawerMeta}>
          @{user?.username ?? "customer"} • Customer
        </Text>
      </View>

      <View style={styles.menuSection}>
        {DRAWER_ROUTES.map((r) => {
          const active = isActive(r.path);
          const isNotifRow = r.key === "notifications";
          return (
            <DrawerItem
              key={r.key}
              label={r.label}
              icon={() => (
                <View
                  style={[
                    styles.iconBubble,
                    active && { backgroundColor: Colors.primary },
                  ]}
                >
                  <Ionicons
                    name={r.icon}
                    size={18}
                    color={active ? "#FFFFFF" : Colors.primary}
                  />
                  {isNotifRow && unreadCount > 0 ? (
                    <View style={styles.notifBadge}>
                      <PulseDot size={10} color={Colors.danger} />
                    </View>
                  ) : null}
                </View>
              )}
              onPress={() => router.push(r.path as any)}
              labelStyle={[
                styles.menuLabel,
                active && { color: Colors.primary, fontWeight: "800" },
              ]}
              style={[
                styles.menuRow,
                active && styles.menuRowActive,
              ]}
            />
          );
        })}
      </View>

      {/* Small footer note helps communicate the "persistent" UX. */}
      <View style={styles.drawerFooter}>
        <Text style={styles.drawerFooterText}>
          Stay signed in — your sidebar stays with you across every page.
        </Text>
      </View>
    </DrawerContentScrollView>
  );
}

export default function CustomerLayout() {
  const { session } = useStore();

  if (!session) return <Redirect href="/auth/login" />;
  if (session.user.role !== "customer")
    return <Redirect href={roleHome(session.user.role) as any} />;

  return (
    <Drawer
      drawerContent={(props) => <CustomerDrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: "800" },
        drawerStyle: {
          backgroundColor: Colors.background,
          width: 300,
        },
        drawerActiveTintColor: Colors.primary,
        drawerInactiveTintColor: Colors.textSecondary,
        drawerType: "front",
        // Smooth slide-in for the drawer pane — pairs with the
        // micro-animations used inside each screen.
        drawerHideStatusBarOnOpen: false,
        sceneStyle: { backgroundColor: Colors.background },
      }}
    >
      <Drawer.Screen name="index" options={{ title: "Home", headerShown: false }} />
      <Drawer.Screen name="orders" options={{ title: "My Orders", headerShown: false }} />
      <Drawer.Screen name="profile" options={{ title: "Profile", headerShown: false }} />
      <Drawer.Screen
        name="notifications"
        options={{ title: "Notifications", headerShown: false }}
      />
      <Drawer.Screen
        name="safety"
        options={{ title: "Safety & Alerts", headerShown: false }}
      />
    </Drawer>
  );
}

const styles = {
  drawerHeader: {
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    alignItems: "center" as const,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  drawerName: {
    fontSize: FontSize.lg,
    fontWeight: "800" as const,
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  drawerMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  menuSection: {
    paddingTop: Spacing.md,
  },
  menuRow: {
    borderRadius: Radius.md,
    marginHorizontal: Spacing.sm,
    marginVertical: 2,
  },
  menuRowActive: {
    backgroundColor: "#CCFBF1",
  },
  menuLabel: {
    fontSize: FontSize.md,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: Colors.surfaceMuted,
  },
  notifBadge: {
    position: "absolute" as const,
    top: -3,
    right: -3,
  },
  drawerFooter: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  drawerFooterText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: "center" as const,
  },
};
