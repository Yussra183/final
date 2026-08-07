/**
 * Operations page — consolidates three formerly-separate supplier screens
 * (Delivery Schedule, Delivery Routes, Sellers On Route) into one
 * tabbed page so the supplier can pivot between "weekly grid", "all
 * routes list", and "sellers on the active trip" without leaving the
 * page.
 *
 * Tabs:
 *   • Schedule — weekly grid (Mon..Sun) of every active route
 *   • Routes   — filterable list of every route the supplier runs
 *   • Sellers  — per-stop card list of the active trip's sellers
 *                (phone, address, ETA, mark-delivered)
 *
 * All functionality from the three merged pages is preserved verbatim;
 * only the chrome around them has changed.
 */
import React, { useMemo, useState } from "react";
import {
  Linking,
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
import { RouteCard } from "../../src/components/RouteCard";
import { StopStatusPill } from "../../src/components/StopStatusPill";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { SidebarLayout } from "../../src/components/SidebarLayout";
import { EmptyState } from "../../src/components/EmptyState";
import { AppButton } from "../../src/components/AppButton";
import { SupplierApprovalGate } from "../../src/components/SupplierApprovalGate";
import { useTripTicker } from "../../src/hooks/useTripTicker";
import {
  haversineMeters,
  pointAtProgress,
  formatDistanceKm,
  formatEta,
  Route,
} from "../../src/lib/location";
import { DeliveryDay, DeliveryRoute } from "../../constants/types";

type OpsTab = "schedule" | "routes" | "sellers";
const DAYS: DeliveryDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SupplierOperations() {
  return (
    <SupplierApprovalGate title="Operations">
      <OperationsContent />
    </SupplierApprovalGate>
  );
}

function OperationsContent() {
  const [tab, setTab] = useState<OpsTab>("schedule");

  return (
    <SidebarLayout>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <View style={styles.header}>
          <DrawerMenuButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Operations</Text>
            <Text style={styles.subtitle}>
              Plan routes, review schedule, and track sellers on the road
            </Text>
          </View>
        </View>

        {/* Tab bar — segmented control */}
        <View style={styles.tabBar}>
          {(
            [
              { key: "schedule", label: "Schedule", icon: "📅" },
              { key: "routes", label: "Routes", icon: "🗺️" },
              { key: "sellers", label: "Sellers on Route", icon: "🧑‍🤝‍🧑" },
            ] as { key: OpsTab; label: string; icon: string }[]
          ).map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                activeOpacity={0.85}
                onPress={() => setTab(t.key)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={styles.tabIcon}>{t.icon}</Text>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {tab === "schedule" ? (
          <ScheduleSection />
        ) : tab === "routes" ? (
          <RoutesSection />
        ) : (
          <SellersSection />
        )}
      </SafeAreaView>
    </SidebarLayout>
  );
}

/* ---------- Schedule (weekly grid) ---------- */

function ScheduleSection() {
  const router = useRouter();
  const { routes } = useStore();

  const routesByDay = (day: DeliveryDay) =>
    routes.filter((r) => r.scheduleDay === day && r.active);

  return (
    <ScrollView
      contentContainerStyle={{
        padding: Spacing.lg,
        paddingTop: 0,
        paddingBottom: Spacing.xxl,
      }}
    >
      {DAYS.map((day) => {
        const dayRoutes = routesByDay(day);
        return (
          <View key={day} style={styles.dayBlock}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayLabel}>{day}</Text>
              <Text style={styles.dayCount}>
                {dayRoutes.length} route{dayRoutes.length === 1 ? "" : "s"}
              </Text>
            </View>
            {dayRoutes.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyText}>No routes scheduled</Text>
              </Card>
            ) : (
              <View style={styles.routesCol}>
                {dayRoutes.map((r) => (
                  <ScheduleRow
                    key={r.id}
                    route={r}
                    onPress={() =>
                      router.push(`/(supplier)/routes/${r.id}` as any)
                    }
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function ScheduleRow({
  route,
  onPress,
}: {
  route: DeliveryRoute;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <Card style={styles.routeCard}>
        <View style={styles.row}>
          <View style={styles.timeBox}>
            <Text style={styles.timeText}>{route.scheduleTime}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.routeName}>{route.name} Route</Text>
            <Text style={styles.routeMeta}>
              {route.stops.length} stops • {route.stops.length} deliveries
            </Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

/* ---------- Routes (list + day filter) ---------- */

function RoutesSection() {
  const router = useRouter();
  const { routes } = useStore();
  const [filter, setFilter] = useState<DeliveryDay | "All">("All");

  const filtered =
    filter === "All"
      ? routes
      : routes.filter((r) => r.scheduleDay === filter);

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {(["All", ...DAYS] as const).map((d) => {
          const active = filter === d;
          return (
            <Text
              key={d}
              onPress={() => setFilter(d as DeliveryDay | "All")}
              style={[styles.chip, active && styles.chipActive]}
            >
              {d}
            </Text>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{
          padding: Spacing.lg,
          paddingTop: 0,
          paddingBottom: Spacing.xxl,
        }}
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon="🗺️"
            title="No routes for that day"
            message="Try a different day filter."
          />
        ) : (
          filtered.map((r) => (
            <RouteCard
              key={r.id}
              route={r}
              onPress={() => router.push(`/(supplier)/routes/${r.id}` as any)}
            />
          ))
        )}
      </ScrollView>
    </>
  );
}

/* ---------- Sellers on active trip ---------- */

function SellersSection() {
  const router = useRouter();
  const {
    session,
    getActiveTripForSupplier,
    routes,
    users,
    markStopDelivered,
  } = useStore();
  const user = session?.user!;
  const trip = getActiveTripForSupplier(user.id);
  useTripTicker(trip?.id);

  const supplierPos = useMemo(() => {
    if (!trip) return null;
    const route = routes.find((r) => r.id === trip.routeId);
    const polyline = route?.polyline ?? [];
    if (polyline.length === 0) return null;
    return pointAtProgress({ polyline } as Route, trip.progress);
  }, [trip, routes]);

  if (!trip) {
    return (
      <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
        <EmptyState
          icon="🧑‍🤝‍🧑"
          title="No active trip"
          message="Start a delivery to see sellers assigned to your route."
          action={
            <AppButton
              title="Start delivery"
              variant="primary"
              onPress={() => router.push("/(supplier)/live" as any)}
            />
          }
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{
        padding: Spacing.lg,
        paddingTop: 0,
        paddingBottom: Spacing.xxl,
      }}
    >
      <Text style={styles.subhead}>
        {trip.routeName} route • {trip.stops.length} stops
      </Text>

      {trip.stops.map((s) => {
        const seller = users.find((u) => u.id === s.sellerId);
        const distance = supplierPos
          ? haversineMeters(supplierPos, { lat: s.lat, lng: s.lng })
          : null;
        const etaSec = distance != null ? (distance / 1000) / 30 * 3600 : null;
        return (
          <Card key={s.sellerId} style={styles.sellerCard}>
            <View style={styles.row}>
              <View style={styles.seq}>
                <Text style={styles.seqText}>{s.sequence}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{s.sellerName}</Text>
                <Text style={styles.address}>{s.address}</Text>
                {seller ? (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(`tel:${seller.phone}`)}
                    style={styles.phoneRow}
                  >
                    <Ionicons
                      name="call-outline"
                      size={12}
                      color={Colors.supplier}
                    />
                    <Text style={styles.phone}>{seller.phone}</Text>
                  </TouchableOpacity>
                ) : null}
                <View style={{ marginTop: Spacing.xs }}>
                  <StopStatusPill status={s.status} />
                </View>
                {distance != null && s.status !== "delivered" ? (
                  <Text style={styles.distance}>
                    {formatDistanceKm(distance)} away • ETA{" "}
                    {formatEta(etaSec ?? 0)}
                  </Text>
                ) : null}
              </View>
              {s.status !== "delivered" ? (
                <AppButton
                  title="Delivered"
                  variant="primary"
                  style={{
                    paddingHorizontal: Spacing.md,
                    paddingVertical: 8,
                  }}
                  onPress={() => markStopDelivered(trip.id, s.sellerId)}
                />
              ) : (
                <Ionicons
                  name="checkmark-circle"
                  size={28}
                  color={Colors.success}
                />
              )}
            </View>
          </Card>
        );
      })}
    </ScrollView>
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
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  /* segmented tab bar */
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 6,
  },
  tabActive: {
    backgroundColor: Colors.supplier,
    borderColor: Colors.supplier,
  },
  tabIcon: { fontSize: 14 },
  tabText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
  tabTextActive: { color: "#FFF" },
  /* schedule */
  dayBlock: { marginBottom: Spacing.md },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  dayLabel: { fontSize: FontSize.md, fontWeight: "800", color: Colors.text },
  dayCount: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  routesCol: { gap: Spacing.sm },
  routeCard: { padding: Spacing.md },
  row: { flexDirection: "row", alignItems: "center" },
  timeBox: {
    width: 64,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  timeText: {
    color: Colors.supplier,
    fontWeight: "800",
    fontSize: FontSize.md,
  },
  routeName: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  routeMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: "600",
  },
  emptyCard: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  emptyText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: "600",
  },
  /* routes */
  chipsRow: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textSecondary,
    fontWeight: "700",
    fontSize: FontSize.xs,
    overflow: "hidden",
  },
  chipActive: {
    backgroundColor: Colors.supplier,
    borderColor: Colors.supplier,
    color: "#FFF",
  },
  /* sellers */
  subhead: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  sellerCard: { marginBottom: Spacing.sm },
  seq: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  seqText: { color: Colors.supplier, fontWeight: "800", fontSize: FontSize.md },
  name: { fontSize: FontSize.md, fontWeight: "800", color: Colors.text },
  address: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  phoneRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  phone: {
    color: Colors.supplier,
    fontSize: FontSize.xs,
    fontWeight: "700",
    marginLeft: 4,
  },
  distance: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
    fontWeight: "700",
  },
});