/**
 * Admin Dashboard – Reports page.
 *
 * Every chart and figure on this page comes from `GET /api/admin/reports`,
 * which runs GROUP BY aggregations over the `orders` table inside the
 * selected window, and from `GET /api/admin/stats` for the system-wide
 * headcounts.
 *
 * There is no sample data and no illustrative series here: an empty
 * window produces empty charts. Metrics the schema cannot support —
 * on-time delivery rate, customer satisfaction, rider utilisation — are
 * deliberately absent rather than estimated.
 */
import React, { useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AdminLayout } from "../../src/components/admin/AdminLayout";
import {
  AdminAsyncBoundary,
  AdminBarChart,
  AdminButton,
  AdminCard,
  AdminDonut,
  AdminEmptyState,
  AdminHBarChart,
  AdminLineChart,
  AdminStatTile,
} from "../../src/components/admin";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { AdminApi } from "../../src/api/endpoints";
import { useAdminResource } from "../../src/hooks/useAdminResource";
import type { AdminReport, AdminStats } from "../../constants/types";

/** Reporting windows, expressed as a day count back from now. */
const RANGES: { key: string; label: string; days: number }[] = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last 12 months", days: 365 },
];

const formatCurrency = (n: number) =>
  `TZS ${Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
};

/** "2026-07-17" → "17 Jul", for compact chart axis labels. */
const shortDay = (isoDate: string) => {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export default function ReportsPage() {
  const [range, setRange] = useState("30");

  const days = RANGES.find((r) => r.key === range)?.days ?? 30;
  const from = useMemo(
    () => new Date(Date.now() - days * 86_400_000).toISOString(),
    [days],
  );

  const report = useAdminResource<AdminReport>(
    () => AdminApi.reports({ from, limit: 8 }),
    [from],
  );
  const stats = useAdminResource<AdminStats>(() => AdminApi.stats());

  const reloadAll = async () => {
    await Promise.all([report.reload(), stats.reload()]);
  };

  const r = report.data;
  const s = stats.data;

  /** Status mix for the donut — zero-count statuses are dropped. */
  const statusSlices = useMemo(() => {
    if (!r) return [];
    const b = r.statusBreakdown;
    return [
      { label: "Pending", value: b.pending, color: Colors.warning },
      { label: "Accepted", value: b.accepted, color: Colors.info },
      { label: "Assigned", value: b.assigned, color: Colors.primary },
      { label: "Picked Up", value: b.picked_up, color: Colors.accent },
      { label: "In Transit", value: b.in_transit, color: Colors.admin },
      { label: "Delivered", value: b.delivered, color: Colors.success },
      { label: "Cancelled", value: b.cancelled, color: Colors.textMuted },
      { label: "Rejected", value: b.rejected, color: Colors.danger },
    ].filter((x) => x.value > 0);
  }, [r]);

  const handleExport = async () => {
    if (!r) return;
    const lines = [
      `Gas Delivery — Operations Report`,
      `Window: ${formatDate(r.from)} → ${formatDate(r.to)}`,
      ``,
      `Total orders:      ${r.totalOrders}`,
      `Delivered:         ${r.deliveredOrders}`,
      `Cancelled:         ${r.cancelledOrders}`,
      `Rejected:          ${r.rejectedOrders}`,
      `Revenue:           ${formatCurrency(r.revenue)}`,
      `Average order:     ${formatCurrency(r.averageOrderValue)}`,
      ``,
      `Top sellers by revenue:`,
      ...r.topSellers.map(
        (t, i) =>
          `  ${i + 1}. ${t.sellerName ?? t.sellerId} — ${t.orders} orders, ${formatCurrency(t.revenue)}`,
      ),
    ];
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      Alert.alert("Export failed", "Couldn't open the share sheet.");
    }
  };

  return (
    <AdminLayout
      title="Reports"
      subtitle="Statistics generated from live database records"
      rightActions={
        <View style={styles.headerActions}>
          <AdminButton
            label="Refresh"
            icon="↻"
            variant="secondary"
            onPress={reloadAll}
            loading={report.refreshing}
          />
          <AdminButton
            label="Export"
            icon="⬆️"
            onPress={handleExport}
            disabled={!r}
          />
        </View>
      }
      refreshControl={
        <RefreshControl refreshing={report.refreshing} onRefresh={reloadAll} />
      }
    >
      {/* Window picker */}
      <View style={styles.rangeRow}>
        {RANGES.map((opt) => {
          const active = range === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              activeOpacity={0.85}
              onPress={() => setRange(opt.key)}
              style={[styles.rangeChip, active && styles.rangeChipActive]}
            >
              <Text
                style={[styles.rangeText, active && styles.rangeTextActive]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <AdminAsyncBoundary
        loading={report.loading}
        error={report.error}
        onRetry={report.reload}
        hasData={!!r}
        loadingLabel="Generating report from database…"
      >
        {r ? (
          <>
            <Text style={styles.windowNote}>
              Covering {formatDate(r.from)} to {formatDate(r.to)}
            </Text>

            {/* Order + revenue headline */}
            <View style={styles.kpiRow}>
              <AdminStatTile
                label="Total Orders"
                value={r.totalOrders}
                icon="📦"
                tone="primary"
              />
              <AdminStatTile
                label="Delivered"
                value={r.deliveredOrders}
                icon="✅"
                tone="success"
              />
              <AdminStatTile
                label="Cancelled"
                value={r.cancelledOrders}
                icon="✖️"
                tone="warning"
              />
              <AdminStatTile
                label="Rejected"
                value={r.rejectedOrders}
                icon="🚫"
                tone="danger"
              />
              <AdminStatTile
                label="Revenue"
                value={formatCurrency(r.revenue)}
                icon="💰"
                tone="accent"
              />
              <AdminStatTile
                label="Average Order"
                value={formatCurrency(r.averageOrderValue)}
                icon="🧾"
                tone="info"
              />
            </View>

            {/* Platform headcounts — from /api/admin/stats */}
            {s ? (
              <>
                <Text style={styles.sectionHeading}>Platform Totals</Text>
                <AdminCard>
                  <AdminHBarChart
                    title="Accounts by role"
                    data={[
                      {
                        label: "Customers",
                        value: s.totalCustomers,
                        color: Colors.success,
                      },
                      {
                        label: "Sellers",
                        value: s.totalSellers,
                        color: Colors.accent,
                      },
                      {
                        label: "Riders",
                        value: s.totalRiders,
                        color: Colors.info,
                      },
                      {
                        label: "Suppliers",
                        value: s.totalSuppliers,
                        color: Colors.primary,
                      },
                      {
                        label: "Admins",
                        value: s.totalAdmins,
                        color: Colors.admin,
                      },
                    ]}
                  />
                </AdminCard>
              </>
            ) : null}

            {/* Daily volume */}
            <Text style={styles.sectionHeading}>Orders Over Time</Text>
            <AdminCard>
              {r.ordersByDay.length === 0 ? (
                <AdminEmptyState
                  icon="📈"
                  title="No orders in this window"
                  message="Widen the date range, or wait for new orders to be placed."
                />
              ) : (
                <>
                  <AdminLineChart
                    title="Orders per day"
                    data={r.ordersByDay.map((d) => ({
                      label: shortDay(d.date),
                      value: d.orders,
                    }))}
                  />
                  <View style={{ marginTop: Spacing.lg }}>
                    <AdminBarChart
                      title="Revenue per day"
                      data={r.ordersByDay.map((d) => ({
                        label: shortDay(d.date),
                        value: d.revenue,
                      }))}
                      formatValue={formatCurrency}
                    />
                  </View>
                </>
              )}
            </AdminCard>

            {/* Status mix */}
            <Text style={styles.sectionHeading}>Order Status Mix</Text>
            <AdminCard>
              {statusSlices.length === 0 ? (
                <AdminEmptyState
                  icon="🍩"
                  title="No orders to break down"
                  message="No orders were placed inside this window."
                />
              ) : (
                <AdminDonut title="Orders by status" data={statusSlices} />
              )}
            </AdminCard>

            {/* Seller leaderboard */}
            <Text style={styles.sectionHeading}>Top Sellers</Text>
            <AdminCard>
              {r.topSellers.length === 0 ? (
                <AdminEmptyState
                  icon="🏪"
                  title="No delivered orders yet"
                  message="Sellers appear here once their orders reach delivered."
                />
              ) : (
                <>
                  <AdminHBarChart
                    title="Revenue by seller (delivered orders)"
                    data={r.topSellers.map((t) => ({
                      label: t.sellerName ?? `Seller ${t.sellerId}`,
                      value: t.revenue,
                    }))}
                    formatValue={formatCurrency}
                  />
                  <View style={styles.leaderboard}>
                    {r.topSellers.map((t, i) => (
                      <View key={t.sellerId} style={styles.leaderRow}>
                        <Text style={styles.leaderRank}>{i + 1}</Text>
                        <Text style={styles.leaderName} numberOfLines={1}>
                          {t.sellerName ?? `Seller ${t.sellerId}`}
                        </Text>
                        <Text style={styles.leaderMeta}>
                          {t.orders} order{t.orders === 1 ? "" : "s"}
                        </Text>
                        <Text style={styles.leaderValue}>
                          {formatCurrency(t.revenue)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </AdminCard>

            <Text style={styles.footnote}>
              All figures are computed by the backend directly from the
              orders, users and products tables at request time. Metrics
              such as on-time delivery rate and customer satisfaction are
              not shown because the database does not currently record the
              data needed to derive them.
            </Text>
          </>
        ) : null}
      </AdminAsyncBoundary>
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rangeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  rangeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rangeChipActive: {
    backgroundColor: Colors.admin,
    borderColor: Colors.admin,
  },
  rangeText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
  rangeTextActive: { color: "#FFF" },
  windowNote: {
    color: Colors.textSecondary,
    fontWeight: "700",
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
  },
  kpiRow: {
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
  leaderboard: {
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  leaderRank: {
    width: 22,
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.textMuted,
  },
  leaderName: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  leaderMeta: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  leaderValue: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.primary,
  },
  footnote: {
    marginTop: Spacing.xl,
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
  },
});
