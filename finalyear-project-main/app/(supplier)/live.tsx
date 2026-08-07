/**
 * Live Delivery page — consolidates the supplier's pre-trip planning
 * ("Start Delivery") and in-trip hero screen ("Live Map Tracking") into
 * one tabbed page.
 *
 * Tabs:
 *   • Live Map  — full LogisticsMap, ETA banner, per-stop timeline, mark
 *                 delivered, completion celebration
 *   • Start Delivery — route/date/time/vehicle/rider picker that creates
 *                      a new trip and lands here on the Live Map tab
 *
 * All functionality from the two merged pages is preserved verbatim;
 * only the chrome has changed.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { AppButton } from "../../src/components/AppButton";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { LogisticsMap } from "../../src/components/LogisticsMap";
import { StopStatusPill } from "../../src/components/StopStatusPill";
import { TripTimeline } from "../../src/components/TripTimeline";
import { SidebarLayout } from "../../src/components/SidebarLayout";
import { EmptyState } from "../../src/components/EmptyState";
import { SupplierApprovalGate } from "../../src/components/SupplierApprovalGate";
import { useTripTicker } from "../../src/hooks/useTripTicker";
import {
  haversineMeters,
  pointAtProgress,
  formatDistanceKm,
  formatEta,
  Route,
} from "../../src/lib/location";
import { DeliveryTrip, LatLng } from "../../constants/types";

type LiveTab = "map" | "start";
const TIMES = ["04:30", "05:00", "05:30", "06:00", "06:30", "07:00", "08:00"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SupplierLive() {
  return (
    <SupplierApprovalGate title="Live Delivery">
      <LiveContent />
    </SupplierApprovalGate>
  );
}

function LiveContent() {
  const {
    session,
    trips,
    getActiveTripForSupplier,
    markStopDelivered,
    routes,
  } = useStore();
  const user = session?.user!;
  const activeTrip = getActiveTripForSupplier(user.id);

  // Default to the Live Map tab when a trip is in progress; otherwise
  // land the supplier on Start Delivery so they can begin one.
  const [tab, setTab] = useState<LiveTab>(activeTrip ? "map" : "start");

  // Drive the animation only if a trip exists.
  useTripTicker(activeTrip?.id);

  return (
    <SidebarLayout>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <View style={styles.header}>
          <DrawerMenuButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Live Delivery</Text>
            <Text style={styles.subtitle}>
              {activeTrip
                ? `${activeTrip.routeName} route • ${activeTrip.vehiclePlate}`
                : "Plan and dispatch a trip"}
            </Text>
          </View>
        </View>

        {/* Segmented control */}
        <View style={styles.tabBar}>
          {(
            [
              { key: "map", label: "Live Map", icon: "📍" },
              { key: "start", label: "Start Delivery", icon: "▶️" },
            ] as { key: LiveTab; label: string; icon: string }[]
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
                <Text
                  style={[styles.tabText, active && styles.tabTextActive]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {tab === "map" ? (
          <LiveMapSection
            trip={activeTrip}
            userId={user.id}
            tripsCount={trips.length}
            onMarkDelivered={(tripId, sellerId) =>
              markStopDelivered(tripId, sellerId)
            }
            fallbackRoutes={routes}
          />
        ) : (
          <StartDeliverySection onStarted={() => setTab("map")} />
        )}
      </SafeAreaView>
    </SidebarLayout>
  );
}

/* ---------- Live Map Tracking ---------- */

interface LiveMapSectionProps {
  trip: DeliveryTrip | undefined;
  userId: string;
  tripsCount: number;
  onMarkDelivered: (tripId: string, sellerId: string) => void;
  fallbackRoutes: ReturnType<typeof useStore>["routes"];
}

function LiveMapSection({
  trip,
  tripsCount,
  onMarkDelivered,
  fallbackRoutes,
}: LiveMapSectionProps) {
  const router = useRouter();
  const { trips } = useStore();

  // Hooks must be called unconditionally — pull everything we need
  // before any early return.
  const route = trip ? fallbackRoutes.find((r) => r.id === trip.routeId) : undefined;
  const polyline = useMemo(() => route?.polyline ?? [], [route]);
  const supplierPos = useMemo<LatLng | null>(() => {
    if (!trip) return null;
    if (polyline.length > 0) {
      return pointAtProgress({ polyline } as Route, trip.progress);
    }
    return { lat: trip.stops[0]?.lat ?? 0, lng: trip.stops[0]?.lng ?? 0 };
  }, [trip, polyline]);
  const nextStop = trip?.stops.find((s) => s.status !== "delivered");
  const eta = useMemo(() => {
    if (!nextStop || !supplierPos) return null;
    const dist = haversineMeters(supplierPos, {
      lat: nextStop.lat,
      lng: nextStop.lng,
    });
    const seconds = (dist / 1000) / 30 * 3600; // ~30 km/h
    return { dist, seconds };
  }, [nextStop, supplierPos]);

  if (!trip || !supplierPos) {
    return (
      <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
        <EmptyState
          icon="📍"
          title="No active trip"
          message="Start a delivery to see live tracking here."
          action={
            <AppButton
              title="Start delivery"
              variant="primary"
              onPress={() => router.push("/(supplier)/live" as any)}
            />
          }
        />
        {tripsCount > 0 ? (
          <Card style={{ marginTop: Spacing.lg }}>
            <Text style={styles.cardTitle}>Recent trip</Text>
            <Text style={styles.subtitle}>
              {trips[0].routeName} on {trips[0].date}
            </Text>
            <Text style={styles.subtitle}>
              Status: {trips[0].status.replace("_", " ")}
            </Text>
          </Card>
        ) : null}
      </ScrollView>
    );
  }

  const served = trip.stops.filter((s) => s.status === "delivered").length;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
      {/* Live map */}
      <View style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.sm }}>
        <LogisticsMap
          stops={trip.stops}
          polyline={polyline}
          supplier={supplierPos}
          height={260}
        />
      </View>

      {/* ETA / current delivery status banner */}
      <Card style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.md }}>
        <Text style={styles.cardTitle}>Current Delivery Status</Text>
        <View style={styles.row}>
          <View style={styles.etaBlock}>
            <Text style={styles.etaLabel}>Progress</Text>
            <Text style={styles.etaValue}>
              {Math.round(trip.progress * 100)}%
            </Text>
          </View>
          <View style={styles.etaDivider} />
          <View style={styles.etaBlock}>
            <Text style={styles.etaLabel}>Served</Text>
            <Text style={styles.etaValue}>
              {served}/{trip.stops.length}
            </Text>
          </View>
          <View style={styles.etaDivider} />
          <View style={styles.etaBlock}>
            <Text style={styles.etaLabel}>ETA next</Text>
            <Text style={styles.etaValue}>
              {eta ? formatEta(eta.seconds) : "—"}
            </Text>
            <Text style={styles.etaSub}>
              {eta ? formatDistanceKm(eta.dist) : "All stops served"}
            </Text>
          </View>
        </View>
        {/* Destination */}
        {nextStop ? (
          <View style={styles.destinationRow}>
            <Ionicons
              name="location-outline"
              size={14}
              color={Colors.supplier}
            />
            <Text style={styles.destinationText} numberOfLines={2}>
              Next stop: {nextStop.sellerName} — {nextStop.address}
            </Text>
          </View>
        ) : null}
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round(trip.progress * 100)}%` },
            ]}
          />
        </View>
        {/* Tracking info */}
        <Text style={styles.trackingLine}>
          Vehicle {trip.vehiclePlate} • Rider {trip.riderName}
        </Text>
      </Card>

      {/* Stops list */}
      <Text style={styles.sectionTitle}>Stops on this trip</Text>
      {trip.stops.map((s) => (
        <Card key={s.sellerId} style={styles.stopCard}>
          <View style={styles.stopRow}>
            <View style={styles.stopSeq}>
              <Text style={styles.stopSeqText}>{s.sequence}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stopName}>{s.sellerName}</Text>
              <Text style={styles.stopAddress}>{s.address}</Text>
              <View style={{ marginTop: Spacing.xs }}>
                <StopStatusPill status={s.status} />
              </View>
            </View>
            {s.status === "near_shop" || s.status === "on_the_way" ? (
              <AppButton
                title="Mark delivered"
                variant="primary"
                style={{
                  paddingHorizontal: Spacing.md,
                  paddingVertical: 8,
                }}
                onPress={() => onMarkDelivered(trip.id, s.sellerId)}
              />
            ) : null}
          </View>
          {s.status !== "delivered" ? (
            <View style={{ marginTop: Spacing.sm }}>
              <TripTimeline status={s.status} compact />
            </View>
          ) : (
            <View style={styles.deliveredRow}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={Colors.success}
              />
              <Text style={styles.deliveredText}>
                Delivered{" "}
                {s.deliveredAt
                  ? `at ${new Date(s.deliveredAt).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : ""}
              </Text>
            </View>
          )}
        </Card>
      ))}

      {/* Completion celebration */}
      {trip.status === "completed" ? (
        <Card style={[styles.stopCard, { backgroundColor: "#DCFCE7" }]}>
          <Text style={styles.completeTitle}>🎉 Trip complete!</Text>
          <Text style={styles.completeSub}>
            All {trip.stops.length} sellers have been served. The{" "}
            {trip.routeName} route is finished for today.
          </Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

/* ---------- Start Delivery form ---------- */

function StartDeliverySection({ onStarted }: { onStarted: () => void }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ routeId?: string }>();
  const { routes, vehicles, riders, startTrip } = useStore();

  // Only consider active routes / vehicles / riders — the toggle on the
  // Fleet page is what activates a row.
  const activeRoutes = useMemo(
    () => routes.filter((r) => r.active),
    [routes],
  );
  const activeVehicles = useMemo(
    () => vehicles.filter((v) => v.active),
    [vehicles],
  );
  const activeRiders = useMemo(
    () => riders.filter((r) => r.active),
    [riders],
  );

  const [routeId, setRouteId] = useState<string>(
    params.routeId ?? activeRoutes[0]?.id ?? "",
  );
  const [date, setDate] = useState<string>(today());
  const [departureTime, setDepartureTime] = useState<string>("05:00");
  const [vehicleId, setVehicleId] = useState<string>(
    activeVehicles[0]?.id ?? "",
  );
  const [riderId, setRiderId] = useState<string>(
    activeRiders[0]?.id ?? "",
  );

  // Selection-survives-refresh guard: if a server refresh removes (or
  // deactivates) the currently-selected row, fall back to the first
  // available active row so the form never renders an orphan selection.
  // This is what makes the brief's "Refresh keeps the selected values"
  // rule work in practice — valid selections survive, stale ones
  // gracefully snap to the next available.
  useEffect(() => {
    if (routeId && !activeRoutes.some((r) => r.id === routeId)) {
      setRouteId(activeRoutes[0]?.id ?? "");
    }
  }, [routeId, activeRoutes]);
  useEffect(() => {
    if (vehicleId && !activeVehicles.some((v) => v.id === vehicleId)) {
      setVehicleId(activeVehicles[0]?.id ?? "");
    }
  }, [vehicleId, activeVehicles]);
  useEffect(() => {
    if (riderId && !activeRiders.some((r) => r.id === riderId)) {
      setRiderId(activeRiders[0]?.id ?? "");
    }
  }, [riderId, activeRiders]);

  const route = useMemo(
    () => routes.find((r) => r.id === routeId),
    [routes, routeId],
  );

  const canStart = !!routeId && !!vehicleId && !!riderId;

  const handleSubmit = async () => {
    if (!canStart) {
      Alert.alert("Missing fields", "Select a route, vehicle, and rider.");
      return;
    }
    try {
      const trip = await startTrip({
        routeId,
        vehicleId,
        riderId,
        date,
        departureTime,
      });
      Alert.alert(
        "Delivery started",
        `${trip.routeName} route is now live. ${trip.stops.length} sellers have been notified.`,
      );
      onStarted();
    } catch (err) {
      Alert.alert("Could not start", (err as Error).message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: Spacing.lg,
          paddingBottom: Spacing.xxl,
        }}
      >
        {/* Route picker */}
        <Section label="Delivery route">
          {activeRoutes.length === 0 ? (
            <Text style={styles.empty}>
              No delivery routes available.
            </Text>
          ) : (
            activeRoutes.map((r) => (
              <Selectable
                key={r.id}
                label={`${r.name} Route`}
                sub={`Every ${r.scheduleDay} at ${r.scheduleTime} • ${r.stops.length} stops`}
                active={r.id === routeId}
                onPress={() => setRouteId(r.id)}
              />
            ))
          )}
        </Section>

        {/* Date — pick from yesterday + today + next 2 days */}
        <Section label="Delivery date">
          <View style={styles.row}>
            {[-1, 0, 1, 2].map((offset) => {
              const d = new Date();
              d.setDate(d.getDate() + offset);
              const iso = d.toISOString().slice(0, 10);
              const label =
                offset === 0
                  ? "Today"
                  : offset === -1
                    ? "Yesterday"
                    : offset === 1
                      ? "Tomorrow"
                      : d.toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "2-digit",
                        });
              return (
                <Chip
                  key={iso}
                  label={`${label}\n${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`}
                  active={date === iso}
                  onPress={() => setDate(iso)}
                />
              );
            })}
          </View>
        </Section>

        {/* Time */}
        <Section label="Departure time">
          <View style={styles.row}>
            {TIMES.map((t) => (
              <Chip
                key={t}
                label={t}
                active={departureTime === t}
                onPress={() => setDepartureTime(t)}
              />
            ))}
          </View>
        </Section>

        {/* Vehicle */}
        <Section label="Vehicle">
          {activeVehicles.length === 0 ? (
            <Text style={styles.empty}>
              No vehicles available.
            </Text>
          ) : (
            activeVehicles.map((v) => (
              <Selectable
                key={v.id}
                label={v.plate}
                sub={`${v.model} • ${v.capacityKg} kg`}
                active={v.id === vehicleId}
                onPress={() => setVehicleId(v.id)}
              />
            ))
          )}
        </Section>

        {/* Rider */}
        <Section label="Rider">
          {activeRiders.length === 0 ? (
            <Text style={styles.empty}>
              No active riders. Add one in Fleet.
            </Text>
          ) : (
            activeRiders.map((r) => (
              <Selectable
                key={r.id}
                label={r.fullName}
                sub={`${r.phone} • License ${r.licenseNo}`}
                active={r.id === riderId}
                onPress={() => setRiderId(r.id)}
              />
            ))
          )}
        </Section>

        {/* Summary */}
        {route ? (
          <Card style={styles.summary}>
            <Text style={styles.summaryTitle}>Trip summary</Text>
            <Text style={styles.summaryLine}>
              • {route.stops.length} stops on {route.name} route
            </Text>
            <Text style={styles.summaryLine}>
              • Departs {date} at {departureTime}
            </Text>
            <Text style={styles.summaryLine}>
              • {vehicles.find((v) => v.id === vehicleId)?.plate ?? "—"} with{" "}
              {riders.find((r) => r.id === riderId)?.fullName ?? "—"}
            </Text>
            <Text style={styles.summaryHint}>
              On start, every seller on this route is notified the truck has
              left.
            </Text>
          </Card>
        ) : null}

        <AppButton
          title="Start delivery"
          variant="primary"
          fullWidth
          disabled={!canStart}
          style={{ marginTop: Spacing.lg }}
          onPress={handleSubmit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Selectable({
  label,
  sub,
  active,
  onPress,
}: {
  label: string;
  sub?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.selectable, active && styles.selectableActive]}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.selectableLabel, active && styles.selectableLabelActive]}
        >
          {label}
        </Text>
        {sub ? <Text style={styles.selectableSub}>{sub}</Text> : null}
      </View>
      <View style={[styles.radio, active && styles.radioActive]}>
        {active ? <View style={styles.radioDot} /> : null}
      </View>
    </TouchableOpacity>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
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
  title: { fontSize: FontSize.xl, fontWeight: "800", color: Colors.text },
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
  /* Live map */
  row: { flexDirection: "row", alignItems: "center" },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  etaBlock: { flex: 1, alignItems: "center" },
  etaLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  etaValue: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: "800",
    marginTop: 2,
  },
  etaSub: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
    fontWeight: "600",
  },
  etaDivider: { width: 1, height: 36, backgroundColor: Colors.border },
  destinationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    gap: 6,
  },
  destinationText: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.supplier,
    borderRadius: Radius.pill,
  },
  trackingLine: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: Spacing.sm,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  stopCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  stopRow: { flexDirection: "row", alignItems: "center" },
  stopSeq: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  stopSeqText: {
    color: Colors.supplier,
    fontWeight: "800",
    fontSize: FontSize.md,
  },
  stopName: { fontSize: FontSize.md, fontWeight: "800", color: Colors.text },
  stopAddress: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  deliveredRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  deliveredText: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: "700",
    marginLeft: 4,
  },
  completeTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.success,
    marginBottom: 4,
  },
  completeSub: { color: Colors.text, fontSize: FontSize.sm },
  /* Start delivery form */
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  selectable: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.xs,
  },
  selectableActive: {
    borderColor: Colors.supplier,
    backgroundColor: "#EEF2FF",
  },
  selectableLabel: { fontWeight: "700", color: Colors.text, fontSize: FontSize.md },
  selectableLabelActive: { color: Colors.supplier },
  selectableSub: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: Colors.supplier },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.supplier,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: {
    borderColor: Colors.supplier,
    backgroundColor: Colors.supplier,
  },
  chipText: {
    color: Colors.textSecondary,
    fontWeight: "700",
    fontSize: FontSize.xs,
  },
  chipTextActive: { color: "#FFF" },
  summary: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
  },
  summaryTitle: {
    fontWeight: "800",
    color: Colors.supplier,
    fontSize: FontSize.md,
    marginBottom: Spacing.xs,
  },
  summaryLine: { color: Colors.text, fontSize: FontSize.sm, marginBottom: 2 },
  summaryHint: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: Spacing.sm,
    fontWeight: "600",
  },
  empty: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontStyle: "italic",
  },
});