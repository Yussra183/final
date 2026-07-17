/**
 * Supplier Logistics Dashboard.
 *
 * The supplier's primary landing page. Surfaces the four metrics that
 * matter for the day:
 *
 *   • Today's scheduled routes
 *   • Active trips in progress
 *   • Sellers served today (across all trips)
 *   • Near-shop notifications generated today
 *
 * Plus a "Today's schedule" list, the active trip's progress, and a
 * shortcut to the Live Map screen.
 */
import React, { useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatCard } from "../../src/components/StatCard";
import { Avatar } from "../../src/components/Avatar";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { AppButton } from "../../src/components/AppButton";
import { SidebarLayout } from "../../src/components/SidebarLayout";
import { EmptyState } from "../../src/components/EmptyState";
import { StatusPill } from "../../src/components/StatusPill";
import { DeliveryDay, DeliveryTrip } from "../../constants/types";

const ACCENT = "#6366F1";

const DAY_OF_WEEK: DeliveryDay[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function todayDay(): DeliveryDay {
  // Today's date is 2026-07-07 per the harness. July 7, 2026 is a
  // Tuesday — but we read it dynamically so the demo is correct for
  // any actual current date.
  return DAY_OF_WEEK[new Date().getDay()] as DeliveryDay;
}

export default function SupplierDashboard() {
  const router = useRouter();
  const {
    session,
    routes,
    notifications,
    getActiveTripForSupplier,
    getTripsForSupplier,
  } = useStore();
  const user = session?.user!;
  const day = todayDay();
  const activeTrip = getActiveTripForSupplier(user.id);
  const supplierTrips = getTripsForSupplier(user.id);

  const todayRoutes = useMemo(
    () => routes.filter((r) => r.scheduleDay === day && r.active),
    [routes, day],
  );

  const tripsStartedToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return supplierTrips.filter((t) => t.date === today && t.status !== "draft");
  }, [supplierTrips]);

  const sellersServedToday = useMemo(() => {
    return supplierTrips
      .flatMap((t) => t.stops)
      .filter((s) => s.status === "delivered").length;
  }, [supplierTrips]);

  const nearArrivals = useMemo(() => {
    return notifications.filter(
      (n) =>
        n.type === "near_arrival" &&
        n.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10),
    ).length;
  }, [notifications]);

  const completedTrips = supplierTrips.filter(
    (t) => t.status === "completed",
  ).length;

  return (
    <SidebarLayout>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
          {/* Header */}
          <View style={styles.header}>
            <DrawerMenuButton />
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>Supplier Dashboard</Text>
              <Text style={styles.subtitle}>
                {user.fullName} • Today is {day}
              </Text>
            </View>
            <Avatar name={user.fullName} size={48} color={ACCENT} />
          </View>

          {/* KPI strip */}
          <View style={styles.statsRow}>
            <StatCard
              label="Today's routes"
              value={todayRoutes.length}
              icon="🗺️"
              tone="primary"
              style={{ marginRight: Spacing.sm }}
            />
            <StatCard
              label="Trips started"
              value={tripsStartedToday.length}
              icon="▶️"
              tone="accent"
            />
          </View>
          <View style={[styles.statsRow, { marginTop: Spacing.sm }]}>
            <StatCard
              label="Sellers served"
              value={sellersServedToday}
              icon="📦"
              tone="info"
              style={{ marginRight: Spacing.sm }}
            />
            <StatCard
              label="Near-shop alerts"
              value={nearArrivals}
              icon="📍"
              tone="warning"
            />
          </View>

          {/* Active trip call-out */}
          {activeTrip ? (
            <View style={{ marginTop: Spacing.lg }}>
              <Text style={styles.sectionTitle}>Active trip</Text>
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{activeTrip.routeName} route</Text>
                    <Text style={styles.itemMeta}>
                      {activeTrip.vehiclePlate} • {activeTrip.riderName}
                    </Text>
                  </View>
                  <StatusPill label={activeTrip.status.replace("_", " ")} tone="info" />
                </View>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round(activeTrip.progress * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressLabel}>
                  {Math.round(activeTrip.progress * 100)}% complete • {activeTrip.stops.filter((s) => s.status === "delivered").length}/{activeTrip.stops.length} stops served
                </Text>
                <AppButton
                  title="Open live map"
                  variant="primary"
                  fullWidth
                  style={{ marginTop: Spacing.sm }}
                  onPress={() => router.push("/(supplier)/live-map" as any)}
                />
              </Card>
            </View>
          ) : null}

          {/* Today's schedule */}
          <Text style={styles.sectionTitle}>Today&apos;s schedule</Text>
          {todayRoutes.length === 0 ? (
            <View style={{ marginHorizontal: Spacing.lg }}>
              <EmptyState
                icon="🗓️"
                title="No routes today"
                message={`No routes are scheduled for ${day}.`}
              />
            </View>
          ) : (
            todayRoutes.map((r) => (
              <Card
                key={r.id}
                style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.sm }}
              >
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{r.name} route</Text>
                    <Text style={styles.itemMeta}>
                      Departs {r.scheduleTime} • {r.stops.length} stops
                    </Text>
                  </View>
                  <StatusPill label={r.scheduleTime} tone="primary" />
                </View>
              </Card>
            ))
          )}

          {/* Recent trips */}
          <Text style={styles.sectionTitle}>Recent trips</Text>
          {supplierTrips.length === 0 ? (
            <View style={{ marginHorizontal: Spacing.lg }}>
              <EmptyState
                icon="🚛"
                title="No trips yet"
                message="Start a delivery to see trip history here."
              />
            </View>
          ) : (
            supplierTrips.slice(0, 4).map((t) => (
              <TripSummary key={t.id} trip={t} />
            ))
          )}

          {/* Quick actions */}
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <View style={styles.actionGrid}>
            {[
              { label: "Start Delivery", icon: "▶️", route: "/(supplier)/start-delivery" },
              { label: "Live Map", icon: "📍", route: "/(supplier)/live-map" },
              { label: "Routes", icon: "🗺️", route: "/(supplier)/routes" },
              { label: "Reports", icon: "📊", route: "/(supplier)/reports" },
            ].map((a) => (
              <TouchableOpacity
                key={a.label}
                style={styles.actionTile}
                activeOpacity={0.8}
                onPress={() => router.push(a.route as any)}
              >
                <Text style={styles.actionIcon}>{a.icon}</Text>
                <Text style={styles.actionLabel}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.footnote}>
            Completed trips: {completedTrips} • Total stops served: {sellersServedToday}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </SidebarLayout>
  );
}

function TripSummary({ trip }: { trip: DeliveryTrip }) {
  const router = useRouter();
  const served = trip.stops.filter((s) => s.status === "delivered").length;
  const tone =
    trip.status === "completed"
      ? "success"
      : trip.status === "in_transit"
        ? "info"
        : "primary";
  return (
    <Card style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.sm }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitle}>{trip.routeName} route</Text>
          <Text style={styles.itemMeta}>
            {trip.date} • {trip.departureTime} • {trip.vehiclePlate}
          </Text>
          <Text style={styles.itemMeta}>
            Served {served}/{trip.stops.length} stops
          </Text>
        </View>
        <StatusPill label={trip.status.replace("_", " ")} tone={tone as any} />
      </View>
      {trip.status === "in_transit" ? (
        <AppButton
          title="Open live map"
          variant="secondary"
          fullWidth
          style={{ marginTop: Spacing.sm }}
          onPress={() => router.push("/(supplier)/live-map" as any)}
        />
      ) : null}
    </Card>
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
  greeting: { fontSize: FontSize.xl, fontWeight: "800", color: Colors.text },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  statsRow: { flexDirection: "row", paddingHorizontal: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center" },
  itemTitle: { fontWeight: "800", color: Colors.text, fontSize: FontSize.md },
  itemMeta: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  actionTile: {
    flexBasis: "47%",
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: "center",
    boxShadow: "0 4px 8px rgba(0,0,0,0.08)",
  },
  actionIcon: { fontSize: 28, marginBottom: 4 },
  actionLabel: { fontSize: FontSize.xs, fontWeight: "700", color: Colors.text },
  progressBar: {
    height: 8,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: ACCENT,
    borderRadius: Radius.pill,
  },
  progressLabel: {
    marginTop: Spacing.xs,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  footnote: {
    textAlign: "center",
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: "600",
    marginTop: Spacing.lg,
  },
});