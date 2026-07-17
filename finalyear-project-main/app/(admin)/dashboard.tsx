/**
 * Admin Dashboard – Home page.
 *
 * Top-row KPI tiles for Total Suppliers, Sellers, Riders, Customers,
 * Pending Seller/Rider Applications, and Active Orders. Followed by
 * a Recent Activities feed and quick-action links.
 */
import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { AdminLayout } from "../../src/components/admin/AdminLayout";
import {
  AdminCard,
  AdminCardSection,
  AdminStatTile,
  AdminBadge,
  AdminAvatar,
} from "../../src/components/admin";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../constants/colors";
import {
  CUSTOMERS,
  ORDERS,
  RECENT_ACTIVITIES,
  RIDER_APPLICATIONS,
  RIDERS,
  SELLER_APPLICATIONS,
  SELLERS,
  SUPPLIERS,
} from "../../src/store/adminData";

const ACTIVITY_ICON: Record<string, string> = {
  seller_application: "📥",
  rider_application: "📥",
  supplier_registered: "🏭",
  rider_assigned: "🛵",
  order_placed: "🛒",
  order_delivered: "✅",
};

export default function AdminDashboardHome() {
  const router = useRouter();

  const stats = useMemo(() => {
    const activeOrders = ORDERS.filter(
      (o) =>
        o.status === "pending" ||
        o.status === "processing" ||
        o.status === "in_transit",
    ).length;
    const pendingSellerApps = SELLER_APPLICATIONS.filter(
      (s) => s.status === "pending",
    ).length;
    const pendingRiderApps = RIDER_APPLICATIONS.filter(
      (r) => r.status === "pending",
    ).length;

    return {
      suppliers: SUPPLIERS.length,
      sellers: SELLERS.length,
      riders: RIDERS.length,
      customers: CUSTOMERS.length,
      pendingSellerApps,
      pendingRiderApps,
      activeOrders,
      revenue: ORDERS.filter((o) => o.status === "delivered").reduce(
        (s, o) => s + o.total,
        0,
      ),
    };
  }, []);

  const formatCurrency = (n: number) =>
    `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

  return (
    <AdminLayout
      title="Dashboard"
      subtitle="Overview of operations and pending approvals"
      rightActions={
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push("/reports" as any)}
          >
            <Text style={styles.headerBtnIcon}>📊</Text>
            <Text style={styles.headerBtnText}>Generate Report</Text>
          </TouchableOpacity>
        </View>
      }
    >
      {/* KPI Grid */}
      <View style={styles.kpiGrid}>
        <AdminStatTile
          label="Total Suppliers"
          value={stats.suppliers}
          icon="🏭"
          tone="primary"
          delta="+2"
          deltaTone="up"
        />
        <AdminStatTile
          label="Total Sellers"
          value={stats.sellers}
          icon="🏪"
          tone="accent"
          delta="+3"
          deltaTone="up"
        />
        <AdminStatTile
          label="Total Riders"
          value={stats.riders}
          icon="🛵"
          tone="info"
          delta="+5"
          deltaTone="up"
        />
        <AdminStatTile
          label="Total Customers"
          value={stats.customers}
          icon="👥"
          tone="success"
          delta="+12%"
          deltaTone="up"
        />
      </View>

      <View style={[styles.kpiGrid, { marginTop: Spacing.md }]}>
        <AdminStatTile
          label="Pending Seller Apps"
          value={stats.pendingSellerApps}
          icon="📥"
          tone="warning"
        />
        <AdminStatTile
          label="Pending Rider Apps"
          value={stats.pendingRiderApps}
          icon="📥"
          tone="warning"
        />
        <AdminStatTile
          label="Active Orders"
          value={stats.activeOrders}
          icon="🚚"
          tone="info"
        />
        <AdminStatTile
          label="Revenue (Delivered)"
          value={formatCurrency(stats.revenue)}
          icon="💰"
          tone="admin"
          delta="+8.4%"
          deltaTone="up"
        />
      </View>

      {/* Quick actions */}
      <Text style={styles.sectionHeading}>Quick Actions</Text>
      <View style={styles.quickGrid}>
        {[
          {
            label: "Review Seller Apps",
            icon: "📥",
            tone: "#FEF3C7",
            route: "/seller-applications",
            count: stats.pendingSellerApps,
          },
          {
            label: "Review Rider Apps",
            icon: "📥",
            tone: "#FEF3C7",
            route: "/rider-applications",
            count: stats.pendingRiderApps,
          },
          {
            label: "Assign Riders",
            icon: "🛵",
            tone: "#DBEAFE",
            route: "/rider-assignments",
          },
          {
            label: "Register Supplier",
            icon: "🏭",
            tone: "#CCFBF1",
            route: "/suppliers",
          },
          {
            label: "Manage Routes",
            icon: "🗺️",
            tone: "#E0E7FF",
            route: "/routes",
          },
          {
            label: "View Reports",
            icon: "📊",
            tone: "#FCE7F3",
            route: "/reports",
          },
        ].map((a) => (
          <TouchableOpacity
            key={a.label}
            activeOpacity={0.85}
            style={styles.quickTile}
            onPress={() => router.push(a.route as any)}
          >
            <View style={[styles.quickIcon, { backgroundColor: a.tone }]}>
              <Text style={styles.quickIconText}>{a.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickLabel}>{a.label}</Text>
              {a.count !== undefined ? (
                <Text style={styles.quickMeta}>{a.count} pending</Text>
              ) : null}
            </View>
            <Text style={styles.quickArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Activity + Recent Orders */}
      <View style={styles.bottomGrid}>
        <AdminCard style={{ flex: 1 }}>
          <Text style={styles.cardHeading}>Recent Activities</Text>
          <View style={{ marginTop: Spacing.md, gap: 12 }}>
            {RECENT_ACTIVITIES.map((a) => (
              <View key={a.id} style={styles.activityRow}>
                <View style={styles.activityIcon}>
                  <Text style={{ fontSize: 16 }}>
                    {ACTIVITY_ICON[a.type] ?? "•"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityText}>{a.message}</Text>
                  <Text style={styles.activityTime}>{a.timestamp}</Text>
                </View>
              </View>
            ))}
          </View>
        </AdminCard>

        <AdminCard style={{ flex: 1 }}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeading}>Recent Orders</Text>
            <TouchableOpacity
              onPress={() => router.push("/orders" as any)}
            >
              <Text style={styles.cardLink}>See all</Text>
            </TouchableOpacity>
          </View>
          <View style={{ marginTop: Spacing.md, gap: Spacing.sm }}>
            {ORDERS.slice(0, 5).map((o) => (
              <View key={o.id} style={styles.orderRow}>
                <AdminAvatar name={o.customerName} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderName}>{o.customerName}</Text>
                  <Text style={styles.orderMeta}>
                    #{o.id.slice(-4)} • {o.product}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.orderTotal}>
                    {formatCurrency(o.total)}
                  </Text>
                  <AdminBadge
                    label={o.status.replace("_", " ")}
                    tone={
                      o.status === "delivered"
                        ? "success"
                        : o.status === "cancelled"
                        ? "danger"
                        : o.status === "in_transit" || o.status === "processing"
                        ? "info"
                        : "warning"
                    }
                  />
                </View>
              </View>
            ))}
          </View>
        </AdminCard>
      </View>

      <AdminCardSection
        title="System Health"
        subtitle="Real-time snapshot of operational metrics"
        style={{ marginTop: Spacing.lg }}
      >
        <View style={styles.healthGrid}>
          <View style={styles.healthItem}>
            <Text style={styles.healthLabel}>Order success rate</Text>
            <View style={styles.healthBarTrack}>
              <View
                style={[
                  styles.healthBarFill,
                  { width: "94%", backgroundColor: Colors.success },
                ]}
              />
            </View>
            <Text style={styles.healthValue}>94%</Text>
          </View>
          <View style={styles.healthItem}>
            <Text style={styles.healthLabel}>On-time deliveries</Text>
            <View style={styles.healthBarTrack}>
              <View
                style={[
                  styles.healthBarFill,
                  { width: "88%", backgroundColor: Colors.info },
                ]}
              />
            </View>
            <Text style={styles.healthValue}>88%</Text>
          </View>
          <View style={styles.healthItem}>
            <Text style={styles.healthLabel}>Customer satisfaction</Text>
            <View style={styles.healthBarTrack}>
              <View
                style={[
                  styles.healthBarFill,
                  { width: "92%", backgroundColor: Colors.primary },
                ]}
              />
            </View>
            <Text style={styles.healthValue}>92%</Text>
          </View>
          <View style={styles.healthItem}>
            <Text style={styles.healthLabel}>Rider utilisation</Text>
            <View style={styles.healthBarTrack}>
              <View
                style={[
                  styles.healthBarFill,
                  { width: "76%", backgroundColor: Colors.warning },
                ]}
              />
            </View>
            <Text style={styles.healthValue}>76%</Text>
          </View>
        </View>
      </AdminCardSection>
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.admin,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    borderRadius: Radius.md,
  },
  headerBtnIcon: {
    color: "#FFF",
    fontSize: 14,
    marginRight: 6,
  },
  headerBtnText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: FontSize.sm,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  sectionHeading: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  quickTile: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  quickIconText: { fontSize: 20 },
  quickLabel: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  quickMeta: {
    fontSize: 11,
    color: Colors.warning,
    fontWeight: "800",
    marginTop: 2,
  },
  quickArrow: {
    fontSize: 22,
    color: Colors.textMuted,
    marginLeft: Spacing.sm,
  },
  bottomGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeading: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  cardLink: {
    color: Colors.admin,
    fontWeight: "800",
    fontSize: FontSize.sm,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  activityIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  activityText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  activityTime: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  orderName: {
    fontWeight: "800",
    color: Colors.text,
    fontSize: FontSize.sm,
  },
  orderMeta: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  orderTotal: {
    fontWeight: "800",
    color: Colors.text,
    fontSize: FontSize.sm,
    marginBottom: 4,
  },
  healthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.lg,
  },
  healthItem: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 220,
  },
  healthLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "700",
    marginBottom: 6,
  },
  healthBarTrack: {
    height: 10,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 6,
  },
  healthBarFill: {
    height: "100%",
    borderRadius: 5,
  },
  healthValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "800",
  },
});
