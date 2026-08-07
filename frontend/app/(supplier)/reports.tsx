/**
 * Supplier Reports screen.
 *
 * Shows a weekly summary of the supplier's distribution performance
 * with KPI tiles and a bar chart of deliveries per route.
 *
 * The chart follows the dataviz skill's "single-series bar" form:
 *   • one sequential hue (the supplier brand blue)
 *   • thin bars (28 px) with 4 px rounded data-ends anchored to baseline
 *   • 2 px surface gap between bars and a 2 px ring on hover
 *   • selective direct labels (value on top, route name on x-axis)
 *   • recessive gridlines and baseline
 *   • no legend (one series — x-axis names each bar)
 */
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatCard } from "../../src/components/StatCard";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { SidebarLayout } from "../../src/components/SidebarLayout";

export default function SupplierReports() {
  const { routes, trips, notifications, riders, vehicles } = useStore();

  // Deliveries per route — count all stops delivered across every trip
  // ever taken on each route id.
  const deliveriesPerRoute = useMemo(() => {
    return routes.map((r) => {
      const routeTrips = trips.filter((t) => t.routeId === r.id);
      const delivered = routeTrips.reduce(
        (acc, t) => acc + t.stops.filter((s) => s.status === "delivered").length,
        0,
      );
      return { id: r.id, name: r.name, value: delivered };
    });
  }, [routes, trips]);

  const totalDelivered = deliveriesPerRoute.reduce((acc, x) => acc + x.value, 0);
  const completedTrips = trips.filter((t) => t.status === "completed").length;
  const totalTrips = trips.length;
  const onTimeRate = totalTrips === 0
    ? 0
    : Math.round((completedTrips / totalTrips) * 100);
  const nearArrivalCount = notifications.filter((n) => n.type === "near_arrival").length;

  const maxBarValue = Math.max(1, ...deliveriesPerRoute.map((d) => d.value));

  return (
    <SidebarLayout>
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ paddingBottom: Spacing.xxl }}
      >
        <View style={styles.header}>
          <DrawerMenuButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Reports</Text>
            <Text style={styles.subtitle}>Weekly distribution overview</Text>
          </View>
        </View>

        {/* KPI strip */}
        <View style={styles.statsRow}>
          <StatCard
            label="Trips"
            value={totalTrips}
            icon="🚛"
            tone="primary"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="Completed"
            value={`${completedTrips}/${totalTrips}`}
            icon="✅"
            tone="accent"
          />
        </View>
        <View style={[styles.statsRow, { marginTop: Spacing.sm }]}>
          <StatCard
            label="Deliveries"
            value={totalDelivered}
            icon="📦"
            tone="info"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="On-time"
            value={`${onTimeRate}%`}
            icon="⏱️"
            tone="warning"
          />
        </View>

        {/* Bar chart card */}
        <Text style={styles.sectionTitle}>Deliveries per route</Text>
        <View style={{ marginHorizontal: Spacing.lg }}>
          <Card>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Stops served by route</Text>
              <Text style={styles.chartSubtitle}>All-time</Text>
            </View>
            <View style={styles.chartArea}>
              {/* Subtle horizontal gridlines + y-axis labels */}
              {[1, 0.5, 0].map((frac, idx) => (
                <View key={idx} style={[styles.gridline, { top: `${(1 - frac) * 100}%` }]}>
                  <Text style={styles.gridLabel}>{Math.round(maxBarValue * frac)}</Text>
                </View>
              ))}
              {/* Bars */}
              <View style={styles.barsRow}>
                {deliveriesPerRoute.map((d) => {
                  const heightPct = (d.value / maxBarValue) * 100;
                  return (
                    <View key={d.id} style={styles.barCol}>
                      <Text style={styles.barValue}>{d.value}</Text>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.bar,
                            { height: `${Math.max(heightPct, 4)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.barLabel}>{d.name}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <View style={styles.chartFooter}>
              <Text style={styles.chartFootnote}>
                x-axis: route • y-axis: deliveries served
              </Text>
            </View>
          </Card>
        </View>

        {/* Resource tiles */}
        <Text style={styles.sectionTitle}>Resources</Text>
        <View style={styles.statsRow}>
          <StatCard
            label="Active riders"
            value={riders.filter((r) => r.active).length}
            icon="🪪"
            tone="primary"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="Active vehicles"
            value={vehicles.filter((v) => v.active).length}
            icon="🚚"
            tone="accent"
          />
        </View>

        {/* Near-arrival KPI */}
        <View style={[styles.statsRow, { marginTop: Spacing.sm }]}>
          <StatCard
            label="Near-shop alerts"
            value={nearArrivalCount}
            icon="📍"
            tone="info"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="Active routes"
            value={routes.filter((r) => r.active).length}
            icon="🗺️"
            tone="warning"
          />
        </View>
      </ScrollView>
    </SidebarLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: { fontSize: FontSize.xxl, fontWeight: "800", color: Colors.text },
  subtitle: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  statsRow: { flexDirection: "row", paddingHorizontal: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  chartTitle: { fontWeight: "800", color: Colors.text, fontSize: FontSize.md },
  chartSubtitle: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: "700" },
  chartArea: {
    height: 180,
    position: "relative",
    marginTop: Spacing.sm,
  },
  gridline: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  gridLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: Colors.surface,
    paddingHorizontal: 2,
    transform: [{ translateY: -8 }],
  },
  barsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingTop: Spacing.sm,
    paddingBottom: 0,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 6,
  },
  barTrack: {
    width: 28,
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  bar: {
    width: "100%",
    backgroundColor: Colors.supplier,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barValue: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 2,
  },
  barLabel: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.textSecondary,
    marginTop: 4,
  },
  chartFooter: {
    marginTop: Spacing.sm,
  },
  chartFootnote: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: "700",
  },
});