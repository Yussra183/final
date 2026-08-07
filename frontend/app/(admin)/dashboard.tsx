/**
 * Admin Dashboard – Home page.
 *
 * Every figure on this page comes from `GET /api/admin/stats`, which the
 * backend computes with COUNT/SUM queries over the live tables. Recent
 * orders and the activity feed come from `GET /api/admin/orders` and
 * `GET /api/admin/notifications`.
 *
 * Nothing here is seeded or estimated: if the database is empty the tiles
 * read zero rather than showing a plausible-looking placeholder.
 */
import React, { useCallback } from "react";
import {
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { AdminLayout } from "../../src/components/admin/AdminLayout";
import {
  AdminAsyncBoundary,
  AdminAvatar,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminStatTile,
} from "../../src/components/admin";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { orderStatusLabel, orderTone } from "../../constants/order";
import { AdminApi } from "../../src/api/endpoints";
import { useAdminResource } from "../../src/hooks/useAdminResource";
import type {
  AdminNotification,
  AdminOrder,
  AdminStats,
} from "../../constants/types";

const NOTIFICATION_ICON: Record<string, string> = {
  permit: "📥",
  order: "🛒",
};

/** Tanzanian shilling, the currency the seed data and orders are priced in. */
const formatCurrency = (n: number) =>
  `TZS ${Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const formatWhen = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
};

export default function AdminDashboardHome() {
  const router = useRouter();

  // Three independent reads so a slow list doesn't hold up the tiles.
  const stats = useAdminResource<AdminStats>(() => AdminApi.stats());
  const orders = useAdminResource<AdminOrder[]>(() => AdminApi.orders());
  const activity = useAdminResource<AdminNotification[]>(() =>
    AdminApi.notifications(),
  );

  const reloadAll = useCallback(async () => {
    await Promise.all([stats.reload(), orders.reload(), activity.reload()]);
  }, [stats, orders, activity]);

  // The body (KPI grids + bottom cards) renders ONCE, after all three
  // resources have resolved for the first time. Until then we show the
  // project's official loading state via `AdminAsyncBoundary`. This
  // prevents the brief layout flash that used to appear on mount — where
  // the top bar, sidebar, "Quick Actions" tiles and "No notifications
  // yet" / "No orders yet" empty cards painted for a frame before the
  // statistics request resolved.
  const s = stats.data;
  const recentOrders = (orders.data ?? []).slice(0, 5);
  const recentActivity = (activity.data ?? []).slice(0, 6);
  const bodyLoading =
    (stats.loading && !s) ||
    (orders.loading && !orders.data) ||
    (activity.loading && !activity.data);
  const bodyError =
    (!stats.loading && stats.error && !s) ||
    (!orders.loading && orders.error && !orders.data) ||
    (!activity.loading && activity.error && !activity.data)
      ? stats.error ?? orders.error ?? activity.error
      : null;
  const hasBodyData = !!s && !!orders.data && !!activity.data;
  const refreshErrorBanner =
    !bodyError && (stats.error || orders.error || activity.error)
      ? stats.error ?? orders.error ?? activity.error
      : null;

  return (
    <AdminLayout
      title="Dashboard"
      subtitle="Live overview of operations and pending approvals"
      rightActions={
        <View style={styles.headerActions}>
          <AdminButton
            label="Refresh"
            icon="↻"
            variant="secondary"
            onPress={reloadAll}
            loading={stats.refreshing || orders.refreshing || activity.refreshing}
          />
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push("/reports" as any)}
          >
            <Text style={styles.headerBtnIcon}>📊</Text>
            <Text style={styles.headerBtnText}>View Reports</Text>
          </TouchableOpacity>
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={
            stats.refreshing || orders.refreshing || activity.refreshing
          }
          onRefresh={reloadAll}
        />
      }
    >
      <AdminAsyncBoundary
        loading={bodyLoading}
        error={bodyError}
        onRetry={reloadAll}
        hasData={hasBodyData}
        loadingLabel="Loading dashboard statistics…"
      >
        {s ? (
          <>
            {/* People */}
            <Text style={styles.sectionHeading}>People</Text>
            <View style={styles.kpiGrid}>
              <AdminStatTile
                label="Total Users"
                value={s.totalUsers}
                icon="👤"
                tone="admin"
              />
              <AdminStatTile
                label="Customers"
                value={s.totalCustomers}
                icon="👥"
                tone="success"
              />
              <AdminStatTile
                label="Sellers"
                value={s.totalSellers}
                icon="🏪"
                tone="accent"
              />
              <AdminStatTile
                label="Riders"
                value={s.totalRiders}
                icon="🛵"
                tone="info"
              />
              <AdminStatTile
                label="Suppliers"
                value={s.totalSuppliers}
                icon="🏭"
                tone="primary"
              />
            </View>

            {/* Catalogue + orders */}
            <Text style={styles.sectionHeading}>Orders &amp; Catalogue</Text>
            <View style={styles.kpiGrid}>
              <AdminStatTile
                label="Total Products"
                value={s.totalProducts}
                icon="🛢️"
                tone="primary"
              />
              <AdminStatTile
                label="Total Orders"
                value={s.totalOrders}
                icon="📦"
                tone="admin"
              />
              <AdminStatTile
                label="Active Orders"
                value={s.activeOrders}
                icon="🚚"
                tone="info"
              />
              <AdminStatTile
                label="Revenue (Delivered)"
                value={formatCurrency(s.revenueDelivered)}
                icon="💰"
                tone="success"
              />
            </View>

            <View style={[styles.kpiGrid, { marginTop: Spacing.md }]}>
              <AdminStatTile
                label="Pending"
                value={s.orderStatus.pending}
                icon="⏳"
                tone="warning"
              />
              <AdminStatTile
                label="Accepted"
                value={s.orderStatus.accepted}
                icon="✅"
                tone="info"
              />
              <AdminStatTile
                label="In Progress"
                value={
                  s.orderStatus.assigned +
                  s.orderStatus.picked_up +
                  s.orderStatus.in_transit
                }
                icon="🛵"
                tone="primary"
              />
              <AdminStatTile
                label="Delivered"
                value={s.orderStatus.delivered}
                icon="🏁"
                tone="success"
              />
              <AdminStatTile
                label="Cancelled"
                value={s.orderStatus.cancelled}
                icon="✖️"
                tone="danger"
              />
              <AdminStatTile
                label="Rejected"
                value={s.orderStatus.rejected}
                icon="🚫"
                tone="danger"
              />
            </View>

            {/* Applications + notifications */}
            <Text style={styles.sectionHeading}>
              Seller Applications &amp; Notifications
            </Text>
            <View style={styles.kpiGrid}>
              <AdminStatTile
                label="Pending Applications"
                value={s.pendingSellerApplications}
                icon="📥"
                tone="warning"
              />
              <AdminStatTile
                label="Under Review"
                value={s.underReviewSellerApplications}
                icon="🔍"
                tone="info"
              />
              <AdminStatTile
                label="Approved Sellers"
                value={s.approvedSellers}
                icon="✅"
                tone="success"
              />
              <AdminStatTile
                label="Rejected"
                value={s.rejectedSellerApplications}
                icon="❌"
                tone="danger"
              />
              <AdminStatTile
                label="Notifications"
                value={s.totalNotifications}
                icon="🔔"
                tone="neutral"
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
                  count: s.pendingSellerApplications,
                },
                {
                  label: "Manage Orders",
                  icon: "📦",
                  tone: "#DBEAFE",
                  route: "/orders",
                  count: s.activeOrders,
                },
                {
                  label: "Manage Sellers",
                  icon: "🏪",
                  tone: "#CCFBF1",
                  route: "/sellers",
                },
                {
                  label: "Manage Riders",
                  icon: "🛵",
                  tone: "#E0E7FF",
                  route: "/riders",
                },
                {
                  label: "Customers",
                  icon: "👥",
                  tone: "#FCE7F3",
                  route: "/customers",
                },
                {
                  label: "View Reports",
                  icon: "📊",
                  tone: "#EDE9FE",
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
                      <Text style={styles.quickMeta}>{a.count} open</Text>
                    ) : null}
                  </View>
                  <Text style={styles.quickArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        {/* Activity + recent orders — kept inside the boundary so these
            cards do not paint with empty placeholders before the data
            arrives. The empty states below match the official design
            vocabulary, so when a list is legitimately empty we still
            surface them — but only AFTER the first fetch resolves. */}
        <View style={styles.bottomGrid}>
          <AdminCard style={{ flex: 1 }}>
            <Text style={styles.cardHeading}>Recent Activity</Text>
            <View style={{ marginTop: Spacing.md, gap: 12 }}>
              {recentActivity.length === 0 ? (
                <AdminEmptyState
                  icon="🔔"
                  title="No notifications yet"
                  message="System notifications will appear here as they are recorded."
                />
              ) : (
                recentActivity.map((n) => (
                  <View key={n.id} style={styles.activityRow}>
                    <View style={styles.activityIcon}>
                      <Text style={{ fontSize: 16 }}>
                        {NOTIFICATION_ICON[n.type] ?? "•"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activityText}>{n.title}</Text>
                      <Text style={styles.activityTime}>
                        {n.userName ? `${n.userName} • ` : ""}
                        {formatWhen(n.createdAt)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </AdminCard>

          <AdminCard style={{ flex: 1 }}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardHeading}>Recent Orders</Text>
              <TouchableOpacity onPress={() => router.push("/orders" as any)}>
                <Text style={styles.cardLink}>See all</Text>
              </TouchableOpacity>
            </View>
            <View style={{ marginTop: Spacing.md, gap: Spacing.sm }}>
              {recentOrders.length === 0 ? (
                <AdminEmptyState
                  icon="📦"
                  title="No orders yet"
                  message="Orders placed by customers will appear here."
                />
              ) : (
                recentOrders.map((o) => (
                  <View key={o.id} style={styles.orderRow}>
                    <AdminAvatar name={o.customerName} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderName}>{o.customerName}</Text>
                      <Text style={styles.orderMeta}>
                        #{o.id} • {o.sellerName}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.orderTotal}>
                        {formatCurrency(o.total)}
                      </Text>
                      <AdminBadge
                        label={orderStatusLabel(o.status)}
                        tone={toBadgeTone(o.status)}
                      />
                    </View>
                  </View>
                ))
              )}
            </View>
          </AdminCard>
        </View>

        {/* If a refresh fails while stale data is on screen, surface the
            official banner so the admin knows the figures are old. Kept
            inside the boundary so it only appears once data has loaded. */}
        {refreshErrorBanner ? (
          <View style={styles.refreshBanner}>
            <Text style={styles.refreshBannerText}>
              Showing the last loaded data — refresh failed:{" "}
              {refreshErrorBanner}
            </Text>
            <AdminButton
              label="Retry"
              variant="ghost"
              size="sm"
              onPress={reloadAll}
            />
          </View>
        ) : null}
      </AdminAsyncBoundary>
    </AdminLayout>
  );
}

/** Maps the shared order tone vocabulary onto the badge's tone names. */
function toBadgeTone(status: AdminOrder["status"]) {
  const tone = orderTone(status);
  return tone === "muted" ? "neutral" : tone;
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
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
  refreshBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    backgroundColor: "#FEF3C7",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
  },
  refreshBannerText: {
    flex: 1,
    color: "#92400E",
    fontWeight: "700",
    fontSize: FontSize.sm,
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
});
