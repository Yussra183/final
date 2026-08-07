import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../constants/colors";
import { useStore } from "../store/StoreContext";
import { useSupplierVerificationStatus } from "../hooks/useSupplierVerificationStatus";
import { Avatar } from "./Avatar";

export type SupplierSidebarRoute = {
  key: string;
  label: string;
  icon: string;
  path: string;
  /** "primary" routes the new logistics dashboard; "legacy" routes are
   * the original restock-requests dashboard kept for compatibility. */
  section: "primary" | "legacy";
  /**
   * When true, the route is a supplier *business* feature and stays
   * locked until an administrator approves the supplier's verification
   * application. Account-level routes (Dashboard, Verification,
   * Notifications, Profile) are always reachable so a newly-registered
   * supplier can log in and complete their application.
   */
  requiresApproval?: boolean;
};

/**
 * The supplier dashboard is split into two sections:
 *
 *   • primary — the consolidated logistics dashboard (Dashboard,
 *     Operations, Live Delivery, Fleet, Reports, Profile,
 *     Notifications).
 *   • legacy   — the original restock-requests dashboard, now folded
 *                into a single tabbed "Restock" page (Home, Requests,
 *                Deliveries) and the standalone Guide.
 *
 * Routes flagged `requiresApproval` render with a lock affordance until
 * the supplier's application is APPROVED.
 */
export const SUPPLIER_SIDEBAR_ROUTES: SupplierSidebarRoute[] = [
  { key: "dashboard", label: "Dashboard", icon: "🏭", path: "/(supplier)/dashboard", section: "primary" },
  { key: "operations", label: "Delivery Operations", icon: "🗺️", path: "/(supplier)/operations", section: "primary", requiresApproval: true },
  { key: "live", label: "Live Delivery", icon: "📍", path: "/(supplier)/live", section: "primary", requiresApproval: true },
  { key: "fleet", label: "Fleet", icon: "🚚", path: "/(supplier)/fleet", section: "primary", requiresApproval: true },
  { key: "reports", label: "Reports", icon: "📊", path: "/(supplier)/reports", section: "primary", requiresApproval: true },
  { key: "notifications", label: "Notifications", icon: "🔔", path: "/(supplier)/notifications", section: "primary" },
  { key: "profile", label: "Profile", icon: "👤", path: "/(supplier)/profile", section: "primary" },

  // Legacy — kept from the original restock-requests dashboard, now a
  // single tabbed page that surfaces Home / Requests / Deliveries.
  { key: "restock", label: "Restock", icon: "📥", path: "/(supplier)/restock", section: "legacy", requiresApproval: true },
  { key: "guide", label: "Guide", icon: "📘", path: "/(supplier)/guide", section: "legacy" },
];

interface Props {
  /**
   * When `true`, the sidebar renders as an in-flow panel beside the main
   * content (used by SidebarLayout on desktop). When `false`/omitted it
   * renders as a slide-in overlay content (used by the Drawer navigator).
   */
  asPanel?: boolean;
  /** Called after a route is tapped — useful for closing a drawer. */
  onNavigate?: () => void;
}

/**
 * Supplier sidebar — avatar + supplier name at the top and a focused list
 * of navigation rows. Primary logistics routes appear first, then a
 * visual divider, then the legacy restock-requests dashboard.
 *
 * Used as the Drawer navigator's `drawerContent` and can also be embedded
 * directly into a screen layout (e.g. via SidebarLayout).
 */
export function SupplierSidebar({ asPanel, onNavigate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useStore();
  const user = session?.user;
  // Business routes stay visible but locked until an administrator
  // approves the supplier's verification application.
  const verification = useSupplierVerificationStatus();
  const isApproved = verification.isApproved;

  const isActive = (target: string) => {
    // Strip group prefixes for comparison.
    const norm = (s: string) => s.replace(/^\/\([^)]+\)/, "");
    const a = norm(target);
    const p = norm(pathname ?? "");
    if (a === "") return p === "" || p === "/index";
    return p.startsWith(a);
  };

  const handlePress = (path: string) => {
    router.push(path as any);
    onNavigate?.();
  };

  const containerStyle = [
    styles.root,
    asPanel ? styles.asPanel : styles.asDrawer,
  ];

  const primary = SUPPLIER_SIDEBAR_ROUTES.filter((r) => r.section === "primary");
  const legacy = SUPPLIER_SIDEBAR_ROUTES.filter((r) => r.section === "legacy");

  const renderRow = (r: SupplierSidebarRoute) => {
    const active = isActive(r.path);
    const locked = !!r.requiresApproval && !isApproved;
    return (
      <TouchableOpacity
        key={r.key}
        activeOpacity={0.85}
        // Locked rows route to the Profile screen (where the
        // verification section lives) instead of the gated destination,
        // so the tap always leads somewhere useful.
        onPress={() =>
          handlePress(locked ? "/(supplier)/profile" : r.path)
        }
        style={[
          styles.menuRow,
          active && styles.menuRowActive,
          locked && styles.menuRowLocked,
        ]}
      >
        <View
          style={[
            styles.iconBubble,
            active && { backgroundColor: Colors.supplier },
          ]}
        >
          <Text style={styles.iconBubbleText}>{r.icon}</Text>
        </View>
        <Text
          style={[
            styles.menuLabel,
            active && { color: Colors.supplier, fontWeight: "800" },
          ]}
        >
          {r.label}
        </Text>
        {locked ? <Text style={styles.lockIcon}>🔒</Text> : null}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={containerStyle}
      contentContainerStyle={{ paddingBottom: Spacing.xl }}
    >
      <View style={styles.drawerHeader}>
        <Avatar name={user?.fullName ?? "Supplier"} size={64} />
        <Text style={styles.drawerName}>{user?.fullName ?? "Supplier"}</Text>
        <Text style={styles.drawerMeta}>
          @{user?.username ?? "supplier"} • Supplier
        </Text>
      </View>

      <View style={styles.menuSection}>
        {primary.map(renderRow)}

        <View style={styles.divider}>
          <Text style={styles.dividerLabel}>LEGACY</Text>
        </View>
        {legacy.map(renderRow)}
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
    width: 280,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  drawerHeader: {
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  drawerName: {
    fontSize: FontSize.lg,
    fontWeight: "800",
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
    paddingHorizontal: Spacing.sm,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    marginVertical: 2,
  },
  menuRowActive: {
    backgroundColor: "#E0E7FF",
  },
  menuRowLocked: {
    opacity: 0.5,
  },
  lockIcon: {
    fontSize: 13,
    marginLeft: "auto",
  },
  menuLabel: {
    fontSize: FontSize.md,
    fontWeight: "600",
    color: Colors.text,
    marginLeft: Spacing.md,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceMuted,
  },
  iconBubbleText: {
    fontSize: 16,
  },
  divider: {
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  dividerLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textMuted,
    letterSpacing: 1.2,
  },
});