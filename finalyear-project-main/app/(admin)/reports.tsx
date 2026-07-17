/**
 * Admin Dashboard – Reports page.
 *
 * Provides report generators for Suppliers, Sellers, Riders, Orders,
 * Deliveries and Revenue with charts (bar, horizontal bar, line and
 * donut). Includes a "Download Report" button that triggers a native
 * share sheet / save sheet on each platform.
 */
import React, { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AdminLayout } from "../../src/components/admin/AdminLayout";
import {
  AdminBarChart,
  AdminButton,
  AdminCard,
  AdminDonut,
  AdminHBarChart,
  AdminLineChart,
  AdminStatTile,
} from "../../src/components/admin";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../constants/colors";
import {
  CUSTOMERS,
  ORDERS,
  RIDERS,
  ROUTES,
  SELLERS,
  SUPPLIERS,
} from "../../src/store/adminData";

type ReportKey =
  | "suppliers"
  | "sellers"
  | "riders"
  | "orders"
  | "deliveries"
  | "revenue";

const REPORTS: { key: ReportKey; label: string; icon: string }[] = [
  { key: "suppliers", label: "Suppliers", icon: "🏭" },
  { key: "sellers", label: "Sellers", icon: "🏪" },
  { key: "riders", label: "Riders", icon: "🛵" },
  { key: "orders", label: "Orders", icon: "📦" },
  { key: "deliveries", label: "Deliveries", icon: "🚚" },
  { key: "revenue", label: "Revenue", icon: "💰" },
];

export default function ReportsPage() {
  const [active, setActive] = useState<ReportKey>("revenue");

  const formatCurrency = (n: number) =>
    `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

  const data = useMemo<{
    summary: { label: string; value: string | number; icon: string; tone?: "primary" | "accent" | "success" | "warning" | "danger" | "info" | "admin" | "neutral" }[];
    barChartData?: { label: string; value: number; color?: string }[];
    lineChartData?: { label: string; value: number }[];
    hBarChartData?: { label: string; value: number; color?: string }[];
    donutData?: { label: string; value: number; color: string }[];
  }>(() => {
    switch (active) {
      case "suppliers":
        return {
          summary: [
            { label: "Total Suppliers", value: SUPPLIERS.length, icon: "🏭" },
            {
              label: "Active",
              value: SUPPLIERS.filter((s) => s.status === "active").length,
              icon: "✅",
              tone: "success",
            },
            {
              label: "Routes",
              value: SUPPLIERS.reduce((s, x) => s + x.routes, 0),
              icon: "🗺️",
              tone: "info",
            },
            {
              label: "Suspended",
              value: SUPPLIERS.filter((s) => s.status === "suspended").length,
              icon: "⛔",
              tone: "danger",
            },
          ],
          barChartData: SUPPLIERS.map((s) => ({
            label: s.companyName.split(" ")[0],
            value: s.routes,
            color: Colors.primary,
          })),
          hBarChartData: SUPPLIERS.map((s, i) => ({
            label: s.companyName,
            value: [40, 28, 36, 18, 22][i] ?? 20,
            color: [Colors.primary, Colors.accent, Colors.info, Colors.warning][i % 4],
          })),
        };
      case "sellers":
        return {
          summary: [
            { label: "Total Sellers", value: SELLERS.length, icon: "🏪" },
            {
              label: "Active",
              value: SELLERS.filter((s) => s.status === "active").length,
              icon: "✅",
              tone: "success",
            },
            {
              label: "Total Orders",
              value: SELLERS.reduce((s, x) => s + x.orderCount, 0),
              icon: "📦",
              tone: "info",
            },
            {
              label: "Suspended",
              value: SELLERS.filter((s) => s.status === "suspended").length,
              icon: "⛔",
              tone: "danger",
            },
          ],
          barChartData: SELLERS.map((s) => ({
            label: s.businessName.split(" ")[0],
            value: s.orderCount,
            color: Colors.accent,
          })),
          hBarChartData: SELLERS.map((s) => ({
            label: s.businessName,
            value: s.orderCount,
            color: Colors.primary,
          })),
        };
      case "riders":
        return {
          summary: [
            { label: "Total Riders", value: RIDERS.length, icon: "🛵" },
            {
              label: "Active",
              value: RIDERS.filter((r) => r.status === "active").length,
              icon: "✅",
              tone: "success",
            },
            {
              label: "Suspended",
              value: RIDERS.filter((r) => r.status === "suspended").length,
              icon: "⛔",
              tone: "danger",
            },
            {
              label: "Assigned",
              value: RIDERS.filter((r) => r.assignedSellerId).length,
              icon: "🔗",
              tone: "info",
            },
          ],
          barChartData: RIDERS.map((r, i) => ({
            label: r.fullName.split(" ")[0],
            value: [42, 67, 55, 24][i] ?? 30,
            color: Colors.success,
          })),
          hBarChartData: RIDERS.map((r) => ({
            label: r.fullName,
            value: r.status === "active" ? 90 : r.status === "suspended" ? 10 : 0,
            color:
              r.status === "active"
                ? Colors.success
                : r.status === "suspended"
                ? Colors.danger
                : Colors.textSecondary,
          })),
        };
      case "orders":
        return {
          summary: [
            { label: "Total Orders", value: ORDERS.length, icon: "📦" },
            {
              label: "Delivered",
              value: ORDERS.filter((o) => o.status === "delivered").length,
              icon: "✅",
              tone: "success",
            },
            {
              label: "Active",
              value: ORDERS.filter(
                (o) =>
                  o.status === "pending" ||
                  o.status === "processing" ||
                  o.status === "in_transit",
              ).length,
              icon: "🛒",
              tone: "info",
            },
            {
              label: "Cancelled",
              value: ORDERS.filter((o) => o.status === "cancelled").length,
              icon: "⛔",
              tone: "danger",
            },
          ],
          barChartData: [
            { label: "Pending", value: ORDERS.filter((o) => o.status === "pending").length, color: Colors.warning },
            { label: "Processing", value: ORDERS.filter((o) => o.status === "processing").length, color: Colors.info },
            { label: "In Transit", value: ORDERS.filter((o) => o.status === "in_transit").length, color: Colors.info },
            { label: "Delivered", value: ORDERS.filter((o) => o.status === "delivered").length, color: Colors.success },
            { label: "Cancelled", value: ORDERS.filter((o) => o.status === "cancelled").length, color: Colors.danger },
          ],
          donutData: [
            {
              label: "Pending",
              value: ORDERS.filter((o) => o.status === "pending").length,
              color: Colors.warning,
            },
            {
              label: "Processing",
              value: ORDERS.filter((o) => o.status === "processing").length,
              color: Colors.info,
            },
            {
              label: "Delivered",
              value: ORDERS.filter((o) => o.status === "delivered").length,
              color: Colors.success,
            },
            {
              label: "Cancelled",
              value: ORDERS.filter((o) => o.status === "cancelled").length,
              color: Colors.danger,
            },
          ],
        };
      case "deliveries":
        return {
          summary: [
            {
              label: "Delivered",
              value: ORDERS.filter((o) => o.status === "delivered").length,
              icon: "✅",
              tone: "success",
            },
            {
              label: "In Transit",
              value: ORDERS.filter((o) => o.status === "in_transit").length,
              icon: "🚚",
              tone: "info",
            },
            {
              label: "Routes",
              value: ROUTES.length,
              icon: "🗺️",
            },
            {
              label: "Avg. Delivery Time",
              value: "2h 14m",
              icon: "⏱️",
              tone: "primary",
            },
          ],
          lineChartData: [
            { label: "Mon", value: 38 },
            { label: "Tue", value: 52 },
            { label: "Wed", value: 47 },
            { label: "Thu", value: 64 },
            { label: "Fri", value: 71 },
            { label: "Sat", value: 58 },
            { label: "Sun", value: 33 },
          ],
          hBarChartData: ROUTES.map((r) => ({
            label: r.name,
            value: r.stops.length * 4,
            color: Colors.info,
          })),
        };
      case "revenue":
      default:
        return {
          summary: [
            {
              label: "Total Revenue",
              value: formatCurrency(
                ORDERS.filter((o) => o.status === "delivered").reduce(
                  (s, o) => s + o.total,
                  0,
                ),
              ),
              icon: "💰",
              tone: "success",
            },
            {
              label: "This Month",
              value: formatCurrency(164200),
              icon: "📅",
              tone: "primary",
            },
            {
              label: "Avg. Order",
              value: formatCurrency(3650),
              icon: "🧾",
              tone: "info",
            },
            {
              label: "Top Seller",
              value: "Westgate",
              icon: "🏆",
              tone: "warning",
            },
          ],
          lineChartData: [
            { label: "Jan", value: 98000 },
            { label: "Feb", value: 112000 },
            { label: "Mar", value: 124000 },
            { label: "Apr", value: 138000 },
            { label: "May", value: 156000 },
            { label: "Jun", value: 172000 },
            { label: "Jul", value: 164000 },
          ],
          hBarChartData: SELLERS.slice(0, 4).map((s) => ({
            label: s.businessName,
            value: s.orderCount * 2800,
            color: Colors.primary,
          })),
        };
    }
  }, [active]);

  const handleDownload = async () => {
    try {
      await Share.share({
        message: `${REPORTS.find((r) => r.key === active)?.label} Report – Generated by GasAdmin\nTotal records: ${data.summary[0].value}`,
        title: `${REPORTS.find((r) => r.key === active)?.label} Report`,
      });
    } catch (err: any) {
      Alert.alert("Share failed", err?.message ?? "Unknown error");
    }
  };

  return (
    <AdminLayout
      title="Reports"
      subtitle="Generate downloadable reports with charts and stats"
      rightActions={
        <AdminButton
          icon="⬇"
          label="Download Report"
          onPress={handleDownload}
        />
      }
    >
      {/* Report selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.selectorRow}
      >
        {REPORTS.map((r) => {
          const active_ = active === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              onPress={() => setActive(r.key)}
              activeOpacity={0.85}
              style={[styles.selector, active_ && styles.selectorActive]}
            >
              <Text style={styles.selectorIcon}>{r.icon}</Text>
              <Text
                style={[
                  styles.selectorLabel,
                  active_ && styles.selectorLabelActive,
                ]}
              >
                {r.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* KPI strip */}
      <View style={styles.kpiRow}>
        {data.summary.map((s, i) => (
          <AdminStatTile
            key={i}
            label={s.label}
            value={s.value}
            icon={s.icon}
            tone={s.tone}
          />
        ))}
      </View>

      {/* Charts */}
      <View style={styles.chartGrid}>
        {"barChartData" in data ? (
          <AdminCard>
            <Text style={styles.chartTitle}>
              {REPORTS.find((r) => r.key === active)?.label} –{" "}
              {active === "orders" ? "By Status" : "Performance"}
            </Text>
            <AdminBarChart data={data.barChartData ?? []} />
          </AdminCard>
        ) : null}

        {"lineChartData" in data ? (
          <AdminCard>
            <Text style={styles.chartTitle}>Trend</Text>
            <AdminLineChart
              data={data.lineChartData ?? []}
              formatValue={
                active === "revenue" ? formatCurrency : (v) => String(v)
              }
            />
          </AdminCard>
        ) : null}
      </View>

      <View style={styles.chartGrid}>
        {"hBarChartData" in data ? (
          <AdminCard>
            <Text style={styles.chartTitle}>Top Performers</Text>
            <AdminHBarChart
              data={data.hBarChartData ?? []}
              formatValue={
                active === "revenue"
                  ? formatCurrency
                  : active === "riders"
                  ? (v) => `${v}%`
                  : (v) => String(v)
              }
            />
          </AdminCard>
        ) : null}

        {"donutData" in data ? (
          <AdminCard>
            <Text style={styles.chartTitle}>Status Distribution</Text>
            <AdminDonut data={data.donutData ?? []} />
          </AdminCard>
        ) : null}
      </View>
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  selectorRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: Spacing.lg,
  },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  selectorActive: {
    backgroundColor: Colors.admin,
    borderColor: Colors.admin,
  },
  selectorIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  selectorLabel: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  selectorLabelActive: {
    color: "#FFF",
  },
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  chartGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.lg,
    marginTop: Spacing.lg,
  },
  chartTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.md,
  },
});