/**
 * Admin Sidebar — fixed left-hand navigation for the Admin Dashboard.
 *
 * Modernised navigation surface:
 *   Dashboard · Suppliers · Riders · Sellers · Customers · Products ·
 *   Reports · Notifications · Settings · Profile
 *
 * The profile chip and the Logout action live in the header (see
 * AdminLayout) so they appear exactly once and stay reachable on every
 * screen — including the slide-in mobile drawer. Nested workflows
 * (Supplier Applications, Rider Applications, Seller Applications,
 * Orders, Routes, Schedules, Rider Assignments) are no longer top-level
 * sidebar entries — their pages now expose them as in-page tabs instead.
 * The routes still exist on the backend and remain reachable by deep
 * link from elsewhere in the app.
 *
 * Works as both an embedded panel (desktop) and as a slide-in drawer on
 * smaller viewports.
 *
 * All icons come from the shared {@link adminIconGlyph} vocab so every
 * entry uses the same outline style and the same stroke weight.
 */
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../../constants/colors";
import { adminIconGlyph, AdminIconName } from "./Icon";
export type AdminSidebarRoute = {
  key: string;
  label: string;
  icon: AdminIconName;
  path: string;
  /**
   * The Drawer.Screen route name. Defaults to `key` — but for entries
   * whose sidebar key differs from the actual filename (e.g. "profile"
   * → "profile.tsx") this must point to the real file name.
   */
  screenName?: string;
  /** Section the route belongs to. Dashboard is "primary" (top); the
   *  remaining entries group into "management", "analytics" and "system"
   *  blocks that render in order with labelled dividers in between. */
  section?: "primary" | "management" | "analytics" | "system";
  /** Optional accent color for the leading icon bubble. */
  accent?: string;
};

export const ADMIN_SIDEBAR_ROUTES: AdminSidebarRoute[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: "dashboard",
    path: "/dashboard",
    section: "primary",
    accent: Colors.admin,
  },
  // ── Management
  {
    key: "suppliers",
    label: "Suppliers",
    icon: "suppliers",
    path: "/suppliers",
    section: "management",
    accent: Colors.supplier,
  },
  {
    key: "riders",
    label: "Riders",
    icon: "riders",
    path: "/riders",
    section: "management",
    accent: Colors.rider,
  },
  {
    key: "sellers",
    label: "Sellers",
    icon: "sellers",
    path: "/sellers",
    section: "management",
    accent: Colors.seller,
  },
  {
    key: "customers",
    label: "Customers",
    icon: "customers",
    path: "/customers",
    section: "management",
    accent: Colors.primary,
  },
  {
    key: "products",
    label: "Products",
    icon: "products",
    path: "/products",
    section: "management",
    accent: Colors.info,
  },
  // ── Analytics
  {
    key: "reports",
    label: "Reports",
    icon: "reports",
    path: "/reports",
    section: "analytics",
    accent: Colors.accent,
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: "notifications",
    path: "/notifications",
    section: "analytics",
    accent: Colors.admin,
  },
  // ── System
  {
    key: "settings",
    label: "Settings",
    icon: "settings",
    path: "/settings",
    section: "system",
    accent: Colors.textSecondary,
  },
  {
    key: "profile",
    label: "Profile",
    icon: "profile",
    path: "/profile",
    section: "system",
    accent: Colors.textSecondary,
  },
];

interface Props {
  /** When true, render as an in-flow panel (used on desktop layouts). */
  asPanel?: boolean;
  /** Called after a route is tapped — useful for closing a drawer. */
  onNavigate?: () => void;
}

export function AdminSidebar({ asPanel, onNavigate }: Props) {
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

  const containerStyle = [
    styles.root,
    asPanel ? styles.asPanel : styles.asDrawer,
  ];

  const primary = ADMIN_SIDEBAR_ROUTES.filter((r) => r.section === "primary");
  const management = ADMIN_SIDEBAR_ROUTES.filter((r) => r.section === "management");
  const analytics = ADMIN_SIDEBAR_ROUTES.filter((r) => r.section === "analytics");
  const system = ADMIN_SIDEBAR_ROUTES.filter((r) => r.section === "system");

  const renderGroup = (
    routes: AdminSidebarRoute[],
    label: string,
  ) => {
    if (routes.length === 0) return null;
    return (
      <>
        <View style={styles.sectionDivider}>
          <Text style={styles.sectionDividerText}>{label}</Text>
        </View>
        <View style={styles.menuSection}>
          {routes.map((r) => {
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
                    active
                      ? { backgroundColor: r.accent ?? Colors.admin }
                      : { backgroundColor: Colors.surfaceMuted },
                  ]}
                >
                  <Ionicons
                    name={adminIconGlyph(r.icon)}
                    size={16}
                    color={active ? "#FFF" : (r.accent ?? Colors.textSecondary)}
                  />
                </View>
                <Text
                  style={[
                    styles.menuLabel,
                    active && { color: Colors.text, fontWeight: "800" },
                  ]}
                  numberOfLines={1}
                >
                  {r.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </>
    );
  };

  return (
    <ScrollView
      style={containerStyle}
      contentContainerStyle={{ paddingBottom: Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Brand */}
      <View style={styles.brand}>
        <View style={styles.brandMark}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#FFF" />
        </View>
        <View style={{ marginLeft: Spacing.md, flex: 1 }}>
          <Text style={styles.brandTitle}>System Admin</Text>
          <Text style={styles.brandSubtitle}>Operations Console</Text>
        </View>
      </View>

      {/* Primary entry */}
      {primary.length > 0 ? (
        <View style={styles.menuSection}>
          {primary.map((r) => {
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
                    { backgroundColor: r.accent ?? Colors.admin },
                  ]}
                >
                  <Ionicons name={adminIconGlyph(r.icon)} size={16} color="#FFF" />
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
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <View style={styles.sectionDivider}>
        <Text style={styles.sectionDividerText}>MANAGEMENT</Text>
      </View>
      <View style={styles.menuSection}>
        {management.map((r) => {
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
                  active
                    ? { backgroundColor: r.accent ?? Colors.admin }
                    : { backgroundColor: Colors.surfaceMuted },
                ]}
              >
                <Ionicons
                  name={adminIconGlyph(r.icon)}
                  size={16}
                  color={active ? "#FFF" : (r.accent ?? Colors.textSecondary)}
                />
              </View>
              <Text
                style={[
                  styles.menuLabel,
                  active && { color: Colors.text, fontWeight: "800" },
                ]}
                numberOfLines={1}
              >
                {r.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {renderGroup(analytics, "ANALYTICS")}
      {renderGroup(system, "SYSTEM")}
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
    ...Shadow.card,
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
    letterSpacing: 0.4,
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
  menuSection: {
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  sectionDivider: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  sectionDividerText: {
    fontSize: 10,
    fontWeight: "900",
    color: Colors.textMuted,
    letterSpacing: 1.5,
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
  },
});
