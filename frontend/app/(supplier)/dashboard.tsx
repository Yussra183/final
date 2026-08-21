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
 *
 * NOTE: business logic, store selectors, and approval gating are
 * preserved verbatim — only the visual presentation has been modernised
 * to use Ionicons, the supplier brand palette, and the shared
 * `StatCard` / `EmptyState` props.
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
import { Ionicons } from "@expo/vector-icons";
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
import { SupplierVerificationRequiredCard } from "../../src/components/SupplierVerificationRequiredCard";
import { PressableScale } from "../../src/components/MicroAnimations";
import { useSupplierVerificationStatus } from "../../src/hooks/useSupplierVerificationStatus";
import { DeliveryDay, DeliveryTrip } from "../../constants/types";

const DAY_OF_WEEK: DeliveryDay[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function todayDay(): DeliveryDay {
  return DAY_OF_WEEK[new Date().getDay()] as DeliveryDay;
}

export default function SupplierDashboard() {
  const router = useRouter();
  const verification = useSupplierVerificationStatus();
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
              <Text style={styles.greeting}>Welcome back</Text>
              <Text style={styles.supplierName} numberOfLines={1}>
                {user.fullName}
              </Text>
            </View>
            <Avatar name={user.fullName} size={48} color={Colors.supplier} />
          </View>

          {/* Verification gate banner — surfaces the awaiting-approval
              message to unapproved suppliers on their primary landing
              page. Renders nothing once approved. */}
          {!verification.isApproved ? (
            <View style={{ marginHorizontal: Spacing.lg }}>
              <SupplierVerificationRequiredCard
                info={verification}
                onOpenVerification={() =>
                  router.push("/(supplier)/profile" as any)
                }
              />
            </View>
          ) : null}

          {/* KPI strip */}
          <View style={styles.statsRow}>
            <StatCard
              label="Today's routes"
              value={todayRoutes.length}
              iconName="calendar-outline"
              tone="supplier"
              style={{ marginRight: Spacing.sm }}
            />
            <StatCard
              label="Trips started"
              value={tripsStartedToday.length}
              iconName="play-circle-outline"
              tone="accent"
            />
          </View>
          <View style={[styles.statsRow, { marginTop: Spacing.sm }]}>
            <StatCard
              label="Sellers served"
              value={sellersServedToday}
              iconName="people-outline"
              tone="info"
              style={{ marginRight: Spacing.sm }}
            />
            <StatCard
              label="Near-shop alerts"
              value={nearArrivals}
              iconName="location-outline"
              tone="warning"
            />
          </View>

          {/* Active trip call-out */}
          {activeTrip ? (
            <View style={{ marginTop: Spacing.lg }}>
              <SectionHeader
                title="Active trip"
                actionLabel="Live map"
                actionIcon="navigate-outline"
                onAction={() => router.push("/(supplier)/live" as any)}
              />
              <Card style={styles.activeTripCard}>
                <View style={styles.row}>
                  <View style={[styles.tripIcon, { backgroundColor: "#EEF2FF" }]}>
                    <Ionicons
                      name="car-sport"
                      size={20}
                      color={Colors.supplier}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>
                      {activeTrip.routeName} route
                    </Text>
                    <Text style={styles.itemMeta}>
                      {activeTrip.vehiclePlate} • {activeTrip.riderName}
                    </Text>
                  </View>
                  <StatusPill
                    label={activeTrip.status.replace("_", " ")}
                    tone="info"
                  />
                </View>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.round(activeTrip.progress * 100)}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressLabel}>
                  {Math.round(activeTrip.progress * 100)}% complete •{" "}
                  {
                    activeTrip.stops.filter((s) => s.status === "delivered")
                      .length
                  }
                  /{activeTrip.stops.length} stops served
                </Text>
              </Card>
            </View>
          ) : null}

          {/* Today's schedule */}
          <SectionHeader
            title={`Today's schedule — ${day}`}
            actionLabel="Schedule"
            actionIcon="calendar-outline"
            onAction={() => router.push("/(supplier)/operations" as any)}
          />
          {todayRoutes.length === 0 ? (
            <View style={{ marginHorizontal: Spacing.lg }}>
              <EmptyState
                iconName="calendar-outline"
                title="No routes today"
                message={`No routes are scheduled for ${day}.`}
              />
            </View>
          ) : (
            todayRoutes.map((r) => (
              <PressableScale
                key={r.id}
                onPress={() => router.push(`/(supplier)/routes/${r.id}` as any)}
              >
                <Card style={styles.routeCard}>
                  <View style={styles.row}>
                    <View style={styles.routeTimeBubble}>
                      <Ionicons
                        name="time-outline"
                        size={14}
                        color={Colors.supplier}
                      />
                      <Text style={styles.routeTime}>{r.scheduleTime}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{r.name} route</Text>
                      <Text style={styles.itemMeta}>
                        {r.stops.length} stops scheduled
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={Colors.textMuted}
                    />
                  </View>
                </Card>
              </PressableScale>
            ))
          )}

          {/* Recent trips */}
          <SectionHeader
            title="Recent trips"
            actionLabel="Reports"
            actionIcon="bar-chart-outline"
            onAction={() => router.push("/(supplier)/reports" as any)}
          />
          {supplierTrips.length === 0 ? (
            <View style={{ marginHorizontal: Spacing.lg }}>
              <EmptyState
                iconName="car-outline"
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
          <SectionHeader title="Quick actions" />
          <View style={styles.actionGrid}>
            {[
              {
                label: "Live Delivery",
                icon: "navigate-outline" as const,
                route: "/(supplier)/live",
                requiresApproval: true,
              },
              {
                label: "Operations",
                icon: "calendar-outline" as const,
                route: "/(supplier)/operations",
                requiresApproval: true,
              },
              {
                label: "Fleet",
                icon: "car-sport-outline" as const,
                route: "/(supplier)/fleet",
                requiresApproval: true,
              },
              {
                label: "Restock",
                icon: "cube-outline" as const,
                route: "/(supplier)/restock",
                requiresApproval: true,
              },
            ].map((a) => (
              <PressableScale
                key={a.label}
                style={styles.actionTile}
                onPress={() =>
                  router.push(
                    (a.requiresApproval && !verification.isApproved
                      ? "/(supplier)/profile"
                      : a.route) as any
                  )
                }
              >
                <View style={styles.actionIconBubble}>
                  <Ionicons
                    name={a.icon}
                    size={20}
                    color={Colors.supplier}
                  />
                </View>
                <Text style={styles.actionLabel}>{a.label}</Text>
              </PressableScale>
            ))}
          </View>

          <Text style={styles.footnote}>
            Completed trips: {completedTrips} • Total stops served:{" "}
            {sellersServedToday}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </SidebarLayout>
  );
}

function SectionHeader({
  title,
  actionLabel,
  actionIcon,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} style={styles.sectionAction}>
          <Ionicons
            name={actionIcon ?? "chevron-forward"}
            size={14}
            color={Colors.supplier}
          />
          <Text style={styles.sectionActionLabel}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
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
    <PressableScale
      onPress={() => router.push("/(supplier)/live" as any)}
      style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.sm }}
    >
      <Card>
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
      </Card>
    </PressableScale>
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
  greeting: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  supplierName: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: "#EEF2FF",
  },
  sectionActionLabel: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.supplier,
  },
  row: { flexDirection: "row", alignItems: "center" },
  activeTripCard: {
    marginHorizontal: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.supplier,
  },
  tripIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  routeCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  routeTimeBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: "#EEF2FF",
    marginRight: Spacing.md,
  },
  routeTime: {
    color: Colors.supplier,
    fontWeight: "800",
    fontSize: FontSize.sm,
  },
  itemTitle: {
    fontWeight: "800",
    color: Colors.text,
    fontSize: FontSize.md,
  },
  itemMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.pill,
    marginTop: Spacing.md,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.supplier,
    borderRadius: Radius.pill,
  },
  progressLabel: {
    marginTop: Spacing.sm,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  actionTile: {
    flexBasis: "47%",
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
    marginBottom: Spacing.sm,
  },
  actionLabel: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  footnote: {
    textAlign: "center",
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: "600",
    marginTop: Spacing.lg,
  },
});