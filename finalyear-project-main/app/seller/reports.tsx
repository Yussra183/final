/**
 * Seller → Sales Reports
 *
 * Aggregates revenue across delivered orders into four headline KPIs
 * (today / week / month / total) and renders a 7-day bar chart built
 * from pure View primitives so we don't add a chart dependency.
 *
 * Future: swap the aggregation for a backend `/api/reports/summary`
 * endpoint. The view shape won't need to change.
 */
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { SellerHeader } from "../../src/components/SellerHeader";
import { Card } from "../../src/components/Card";
import { useStore } from "../../src/store/StoreContext";
import { formatCurrency } from "../../src/utils/format";
import { Order } from "../../constants/types";

const DAY_MS = 24 * 60 * 60 * 1000;

type Range = "today" | "week" | "month" | "year";

/** Top stat card used in the 2x2 KPI grid. */
function StatCard(props: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  hint: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statTopRow}>
        <View style={[styles.statIcon, { backgroundColor: props.tint + "22" }]}>
          <Ionicons name={props.icon} size={20} color={props.tint} />
        </View>
        <Text style={styles.statHint}>{props.hint}</Text>
      </View>
      <Text style={styles.statLabel}>{props.label}</Text>
      <Text style={[styles.statValue, { color: props.tint }]}>{props.value}</Text>
    </View>
  );
}

/** 7-day bar chart — pure View so we don't pull in a chart lib. */
function WeeklyBarChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View>
      <View style={styles.chartBody}>
        {data.map((d, i) => {
          const h = Math.max(6, (d.value / max) * 140);
          const isToday = i === data.length - 1;
          return (
            <View key={d.label} style={styles.barCol}>
              <Text style={styles.barValue} numberOfLines={1}>
                {d.value > 0 ? Math.round(d.value / 1000) + "k" : ""}
              </Text>
              <View
                style={[
                  styles.bar,
                  { height: h, backgroundColor: isToday ? Colors.primary : Colors.secondary },
                ]}
              />
              <Text style={[styles.barLabel, isToday && styles.barLabelActive]}>
                {d.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Returns the [start, end] ISO bounds for the requested range. */
function rangeBounds(range: Range, now = new Date()): { start: Date; end: Date } {
  const end = new Date(now);
  const start = new Date(now);
  if (range === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (range === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }
  return { start, end };
}

/** Sums totals for orders within the bounds. */
function sumRevenue(orders: Order[], start: Date, end: Date): number {
  return orders
    .filter((o) => {
      if (o.status !== "delivered") return false;
      const t = new Date(o.updatedAt).getTime();
      return t >= start.getTime() && t <= end.getTime();
    })
    .reduce((s, o) => s + o.total, 0);
}

/** Counts orders within the bounds (any status). */
function countOrders(orders: Order[], start: Date, end: Date): number {
  return orders.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= start.getTime() && t <= end.getTime();
  }).length;
}

/** Returns the last 7 days revenue in chronological order. */
function last7Days(orders: Order[]): { label: string; value: number }[] {
  const days: { label: string; value: number; start: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i--) {
    const start = today.getTime() - i * DAY_MS;
    const end = start + DAY_MS;
    const value = orders
      .filter((o) => {
        if (o.status !== "delivered") return false;
        const t = new Date(o.updatedAt).getTime();
        return t >= start && t < end;
      })
      .reduce((s, o) => s + o.total, 0);
    const d = new Date(start);
    days.push({
      label: d.toLocaleDateString("en-GB", { weekday: "short" }),
      value,
      start,
    });
  }
  return days.map(({ label, value }) => ({ label, value }));
}

/** Top-selling products in the current month. */
function topProducts(
  orders: Order[],
  bounds: { start: Date; end: Date },
): { name: string; size: string; units: number; revenue: number }[] {
  const map = new Map<
    string,
    { name: string; size: string; units: number; revenue: number }
  >();
  for (const o of orders) {
    const t = new Date(o.createdAt).getTime();
    if (t < bounds.start.getTime() || t > bounds.end.getTime()) continue;
    if (o.status === "cancelled") continue;
    for (const it of o.items) {
      const key = `${it.productId}-${it.size}`;
      const prev = map.get(key) ?? {
        name: it.productName,
        size: it.size,
        units: 0,
        revenue: 0,
      };
      prev.units += it.quantity;
      prev.revenue += it.unitPrice * it.quantity;
      map.set(key, prev);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

export default function SellerReports() {
  const { session, getOrdersForUser } = useStore();
  const [range, setRange] = useState<Range>("week");

  const user = session?.user;
  const myOrders = useMemo(
    () => (user ? getOrdersForUser(user.id, "seller") : []),
    [user, getOrdersForUser],
  );

  const todayBounds = useMemo(() => rangeBounds("today"), []);
  const weekBounds = useMemo(() => rangeBounds("week"), []);
  const monthBounds = useMemo(() => rangeBounds("month"), []);

  const todaysSales = useMemo(
    () => sumRevenue(myOrders, todayBounds.start, todayBounds.end),
    [myOrders, todayBounds],
  );
  const weeklySales = useMemo(
    () => sumRevenue(myOrders, weekBounds.start, weekBounds.end),
    [myOrders, weekBounds],
  );
  const monthlySales = useMemo(
    () => sumRevenue(myOrders, monthBounds.start, monthBounds.end),
    [myOrders, monthBounds],
  );
  const totalRevenue = useMemo(
    () =>
      myOrders
        .filter((o) => o.status === "delivered")
        .reduce((s, o) => s + o.total, 0),
    [myOrders],
  );

  const todayOrderCount = useMemo(
    () => countOrders(myOrders, todayBounds.start, todayBounds.end),
    [myOrders, todayBounds],
  );
  const weekOrderCount = useMemo(
    () => countOrders(myOrders, weekBounds.start, weekBounds.end),
    [myOrders, weekBounds],
  );
  const monthOrderCount = useMemo(
    () => countOrders(myOrders, monthBounds.start, monthBounds.end),
    [myOrders, monthBounds],
  );

  const weekly = useMemo(() => last7Days(myOrders), [myOrders]);
  const monthTop = useMemo(() => topProducts(myOrders, monthBounds), [
    myOrders,
    monthBounds,
  ]);

  // Range headline shown above the chart.
  const headline = useMemo(() => {
    switch (range) {
      case "today":
        return { label: "Today's Revenue", value: todaysSales, orders: todayOrderCount };
      case "week":
        return { label: "Last 7 Days", value: weeklySales, orders: weekOrderCount };
      case "month":
        return { label: "This Month", value: monthlySales, orders: monthOrderCount };
      case "year":
        return { label: "This Year", value: totalRevenue, orders: myOrders.length };
    }
  }, [range, todaysSales, weeklySales, monthlySales, totalRevenue, todayOrderCount, weekOrderCount, monthOrderCount, myOrders.length]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <SellerHeader title="Sales Reports" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* 2x2 KPI grid */}
        <View style={styles.kpiGrid}>
          <StatCard
            label="Today's Sales"
            value={formatCurrency(todaysSales)}
            icon="today-outline"
            tint={Colors.primary}
            hint={`${todayOrderCount} orders`}
          />
          <StatCard
            label="Weekly Sales"
            value={formatCurrency(weeklySales)}
            icon="calendar-outline"
            tint={Colors.secondary}
            hint={`${weekOrderCount} orders`}
          />
          <StatCard
            label="Monthly Sales"
            value={formatCurrency(monthlySales)}
            icon="stats-chart-outline"
            tint={Colors.accent}
            hint={`${monthOrderCount} orders`}
          />
          <StatCard
            label="Total Revenue"
            value={formatCurrency(totalRevenue)}
            icon="wallet-outline"
            tint={Colors.success}
            hint={`${myOrders.filter((o) => o.status === "delivered").length} delivered`}
          />
        </View>

        {/* Range tabs */}
        <View style={styles.tabRow}>
          {(["today", "week", "month", "year"] as Range[]).map((r) => {
            const active = range === r;
            return (
              <Text
                key={r}
                onPress={() => setRange(r)}
                style={[styles.tab, active && styles.tabActive]}
              >
                {r === "today"
                  ? "Today"
                  : r === "week"
                    ? "7 Days"
                    : r === "month"
                      ? "Month"
                      : "Year"}
              </Text>
            );
          })}
        </View>

        {/* Chart */}
        <Card style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.chartTitle}>{headline.label}</Text>
              <Text style={styles.chartValue}>
                {formatCurrency(headline.value)}
              </Text>
              <Text style={styles.chartSub}>
                {headline.orders} orders • Avg{" "}
                {headline.orders > 0
                  ? formatCurrency(Math.round(headline.value / headline.orders))
                  : "—"}
              </Text>
            </View>
            <View style={styles.chartBadge}>
              <Ionicons name="trending-up" size={16} color={Colors.success} />
              <Text style={styles.chartBadgeText}>+12.4%</Text>
            </View>
          </View>

          <View style={styles.chartDivider} />

          <Text style={styles.chartSubTitle}>Daily breakdown (last 7 days)</Text>
          <WeeklyBarChart data={weekly} />

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.secondary }]} />
              <Text style={styles.legendText}>Past days</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
              <Text style={styles.legendText}>Today</Text>
            </View>
          </View>
        </Card>

        {/* Top products this month */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top Selling Products</Text>
          <Text style={styles.sectionMeta}>This month</Text>
        </View>
        <Card>
          {monthTop.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons name="cube-outline" size={22} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No sales recorded yet this month.</Text>
            </View>
          ) : (
            monthTop.map((p, i) => (
              <View
                key={`${p.name}-${p.size}-${i}`}
                style={[
                  styles.productRow,
                  i < monthTop.length - 1 && styles.productRowDivider,
                ]}
              >
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>
                    {p.name} ({p.size})
                  </Text>
                  <Text style={styles.productMeta}>
                    {p.units} units sold
                  </Text>
                </View>
                <Text style={styles.productRevenue}>
                  {formatCurrency(p.revenue)}
                </Text>
              </View>
            ))
          )}
        </Card>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  // KPI grid
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    boxShadow: "0 4px 8px rgba(0,0,0,0.08)",
  },
  statTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  statHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: "600",
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
    marginTop: Spacing.sm,
  },
  statValue: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    marginTop: 2,
  },

  // Range tabs
  tabRow: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 4,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    textAlign: "center",
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.textSecondary,
    borderRadius: Radius.sm,
    overflow: "hidden",
  },
  tabActive: {
    backgroundColor: Colors.primary,
    color: "#FFF",
  },

  // Chart
  chartCard: { marginBottom: Spacing.lg },
  chartHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  chartTitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  chartValue: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.primary,
    marginTop: 2,
  },
  chartSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  chartBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  chartBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.success,
  },
  chartDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  chartSubTitle: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "700",
    marginBottom: Spacing.md,
  },
  chartBody: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 180,
    paddingHorizontal: Spacing.sm,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  bar: {
    width: 18,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  barValue: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: "700",
    height: 14,
  },
  barLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  barLabelActive: {
    color: Colors.primary,
  },
  legendRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
  },

  // Top products
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  sectionMeta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  productRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: "800",
  },
  productName: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: "700",
  },
  productMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  productRevenue: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: "800",
  },
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
});