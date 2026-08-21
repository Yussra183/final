/**
 * Supplier Reports screen.
 *
 * Shows a weekly summary of the supplier's distribution performance
 * with KPI tiles and a bar chart of deliveries per route.
 *
 * The chart follows the dataviz skill's "single-series bar" form:
 *   • one sequential hue (the supplier brand indigo)
 *   • thin bars with rounded data-ends anchored to baseline
 *   • selective direct labels (value on top, route name on x-axis)
 *   • recessive gridlines and baseline
 *   • no legend (one series — x-axis names each bar)
 */
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
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
            iconName="car-sport-outline"
            tone="supplier"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="Completed"
            value={`${completedTrips}/${totalTrips}`}
            iconName="checkmark-circle-outline"
            tone="accent"
          />
        </View>
        <View style={[styles.statsRow, { marginTop: Spacing.sm }]}>
          <StatCard
            label="Deliveries"
            value={totalDelivered}
            iconName="cube-outline"
            tone="info"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="On-time"
            value={`${onTimeRate}%`}
            iconName="time-outline"
            tone="warning"
          />
        </View>

        {/* Bar chart card */}
        <Text style={styles.sectionTitle}>Deliveries per route</Text>
        <View style={{ marginHorizontal: Spacing.lg }}>
          <Card>
            <View style={styles.chartHeader}>
              <View style={styles.chartTitleRow}>
                <Ionicons
                  name="bar-chart"
                  size={16}
                  color={Colors.supplier}
                />
                <Text style={styles.chartTitle}>Stops served by route</Text>
              </View>
              <View style={styles.chartSubChip}>
                <Text style={styles.chartSubtitle}>All-time</Text>
              </View>
            </View>
            <View style={styles.chartArea}>
              {/* Subtle horizontal gridlines + y-axis labels */}
              {[1, 0.5, 0].map((frac, idx) => (
                <View
                  key={idx}
                  style={[styles.gridline, { top: `${(1 - frac) * 100}%` }]}
                >
                  <Text style={styles.gridLabel}>
                    {Math.round(maxBarValue * frac)}
                  </Text>
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
                      <Text style={styles.barLabel} numberOfLines={1}>
                        {d.name}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <View style={styles.chartFooter}>
              <Ionicons
                name="information-circle-outline"
                size={11}
                color={Colors.textMuted}
              />
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
            iconName="person-outline"
            tone="supplier"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="Active vehicles"
            value={vehicles.filter((v) => v.active).length}
            iconName="car-sport-outline"
            tone="accent"
          />
        </View>

        {/* Near-arrival KPI */}
        <View style={[styles.statsRow, { marginTop: Spacing.sm }]}>
          <StatCard
            label="Near-shop alerts"
            value={nearArrivalCount}
            iconName="location-outline"
            tone="info"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="Active routes"
            value={routes.filter((r) => r.active).length}
            iconName="map-outline"
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
    gap: Spacing.md,
  },
  title: { fontSize: FontSize.xxl, fontWeight: "800", color: Colors.text },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
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
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  chartTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chartTitle: {
    fontWeight: "800",
    color: Colors.text,
    fontSize: FontSize.md,
  },
  chartSubChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: "#EEF2FF",
  },
  chartSubtitle: {
    color: Colors.supplier,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
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
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.sm,
  },
  chartFootnote: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: "700",
  },
});