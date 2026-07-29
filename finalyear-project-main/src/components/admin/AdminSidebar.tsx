/**
 * Admin Sidebar — fixed left-hand navigation for the Admin Dashboard.
 *
 * Works as both an embedded panel (desktop) and as a slide-in drawer on
 * smaller viewports. Mirrors the visual language of SupplierSidebar but
 * with the full admin route set: Dashboard, Suppliers, Seller/Rider
 * Applications, Rider Assignments, Sellers, Riders, Customers, Routes &
 * Schedules, Orders, Reports, Settings, Profile, Logout.
 */
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../../constants/colors";
import { Avatar } from "../Avatar";
import { useStore } from "../../store/StoreContext";

export type AdminSidebarRoute = {
  key: string;
  label: string;
  icon: string;
  path: string;
  /**
   * The Drawer.Screen route name. Defaults to `key` — but for entries
   * whose sidebar key differs from the actual filename (e.g. "seller-apps"
   * → "seller-applications.tsx") this must point to the real file name.
   */
  screenName?: string;
  /** Highlighted "primary" entry (Dashboard); others sit in the main stack. */
  section?: "main" | "primary";
  /** Show a small numeric badge to the right of the label. */
  badge?: number;
};

export const ADMIN_SIDEBAR_ROUTES: AdminSidebarRoute[] = [
  { key: "dashboard", label: "Dashboard", icon: "🏠", path: "/dashboard", section: "primary" },
  { key: "suppliers", label: "Suppliers", icon: "🏭", path: "/suppliers" },
  { key: "seller-apps", label: "Seller Applications", icon: "📥", path: "/seller-applications", screenName: "seller-applications" },
  { key: "rider-apps", label: "Rider Applications", icon: "📥", path: "/rider-applications", screenName: "rider-applications" },
  { key: "assignments", label: "Rider Assignments", icon: "🛵", path: "/rider-assignments", screenName: "rider-assignments" },
  { key: "sellers", label: "Sellers", icon: "🏪", path: "/sellers" },
  { key: "riders", label: "Riders", icon: "🪪", path: "/riders" },
  { key: "customers", label: "Customers", icon: "👥", path: "/customers" },
  { key: "routes", label: "Routes & Schedules", icon: "🗺️", path: "/routes" },
  { key: "orders", label: "Orders", icon: "📦", path: "/orders" },
  { key: "products", label: "Products", icon: "🛢️", path: "/products" },
  { key: "reports", label: "Reports", icon: "📊", path: "/reports" },
  { key: "settings", label: "Settings", icon: "⚙️", path: "/settings" },
];

interface Props {
  /** When true, render as an in-flow panel (used on desktop layouts). */
  asPanel?: boolean;
  /** Called after a route is tapped — useful for closing a drawer. */
  onNavigate?: () => void;
}

export function AdminSidebar({ asPanel, onNavigate }: Props) {
  const { session } = useStore();
  // The signed-in admin's name drives the profile chip. Falls back to
  // a generic label when there is no session (the layout redirects those
  // cases elsewhere — this only matters for the desktop sidebar panel).
  const adminName = session?.user?.fullName || session?.user?.username || "Admin";
  const router = useRouter();
  const pathname = usePathname();

  const isActive = (target: string) => {
    if (!target) return false;
    // Strip group prefixes like /(admin) so we compare against the
    // canonical URL path.
    const p = (pathname ?? "").replace(/^\/\([^)]+\)/, "");
    if (target === "/dashboard") {
      return (
        p === "/" ||
        p === "" ||
        p === "/dashboard" ||
        p === "/index" ||
        p.endsWith("/dashboard")
      );
    }
    return p === target || p.startsWith(target + "/") || p.startsWith(target);
  };

  const handlePress = (path: string) => {
    if (!path) return;
    router.push(path as any);
    onNavigate?.();
  };

  const handleLogout = () => {
    router.push("/auth/login" as any);
    onNavigate?.();
  };

  const containerStyle = [
    styles.root,
    asPanel ? styles.asPanel : styles.asDrawer,
  ];

  return (
    <ScrollView
      style={containerStyle}
      contentContainerStyle={{ paddingBottom: Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Brand */}
      <View style={styles.brand}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>G</Text>
        </View>
        <View style={{ marginLeft: Spacing.md, flex: 1 }}>
          <Text style={styles.brandTitle}>GasAdmin</Text>
          <Text style={styles.brandSubtitle}>Operations Console</Text>
        </View>
      </View>

      {/* Profile chip */}
      <View style={styles.profileChip}>
        <Avatar name={adminName} size={44} color={Colors.admin} />
        <View style={{ marginLeft: Spacing.md, flex: 1 }}>
          <Text style={styles.profileName} numberOfLines={1}>
            {adminName}
          </Text>
          <Text style={styles.profileMeta} numberOfLines={1}>
            Super Admin
          </Text>
        </View>
      </View>

      {/* Routes */}
      <View style={styles.menuSection}>
        {ADMIN_SIDEBAR_ROUTES.map((r) => {
          if (r.key === "applications-header") {
            return (
              <View key={r.key} style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>APPLICATIONS</Text>
              </View>
            );
          }
          const active = isActive(r.path);
          return (
            <TouchableOpacity
              key={r.key}
              activeOpacity={0.85}
              onPress={() => handlePress(r.path)}
              style={[styles.menuRow, active && styles.menuRowActive]}
            >
              <View
                style={[
                  styles.iconBubble,
                  active && { backgroundColor: Colors.admin },
                ]}
              >
                <Text style={styles.iconBubbleText}>{r.icon}</Text>
              </View>
              <Text
                style={[
                  styles.menuLabel,
                  active && { color: Colors.admin, fontWeight: "800" },
                ]}
                numberOfLines={1}
              >
                {r.label}
              </Text>
              {r.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{r.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.85}
          onPress={() => handlePress("/profile")}
        >
          <View style={styles.iconBubble}>
            <Text style={styles.iconBubbleText}>👤</Text>
          </View>
          <Text style={styles.menuLabel}>Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.85}
          onPress={handleLogout}
        >
          <View style={[styles.iconBubble, { backgroundColor: "#FEE2E2" }]}>
            <Text style={styles.iconBubbleText}>🚪</Text>
          </View>
          <Text style={[styles.menuLabel, { color: Colors.danger }]}>
            Logout
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: Colors.background,
  },
  asDrawer: {
    flex: 1,
  },
  asPanel: {
    width: 260,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.admin,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 6px 12px rgba(30,41,59,0.25)",
  },
  brandMarkText: {
    color: "#FFF",
    fontSize: 22,
    fontWeight: "900",
  },
  brandTitle: {
    fontSize: FontSize.lg,
    fontWeight: "900",
    color: Colors.text,
  },
  brandSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  profileChip: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  profileName: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  profileMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  menuSection: {
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.sm,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  sectionHeaderText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textMuted,
    letterSpacing: 1.2,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    marginVertical: 2,
  },
  menuRowActive: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  menuLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.text,
    marginLeft: Spacing.md,
  },
  iconBubble: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceMuted,
  },
  iconBubbleText: {
    fontSize: 15,
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "800",
  },
  footer: {
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Spacing.md,
  },
});