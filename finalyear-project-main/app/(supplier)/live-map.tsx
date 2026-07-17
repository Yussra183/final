/**
 * Live Map Tracking — the supplier's hero screen. Shows:
 *   • Stylized map with the planned route polyline, every stop as a
 *     numbered marker (dimmed when delivered), and a pulsing supplier
 *     truck pin.
 *   • ETA banner: overall trip progress + ETA to the next pending stop.
 *   • Per-stop list with the TripTimeline stepper. The supplier can tap
 *     "Mark delivered" on the current stop to advance its state.
 *
 * The screen drives `useTripTicker` which advances `progress` along the
 * polyline every ~1.5 s, fires near-arrival notifications, and stops
 * when the trip completes.
 */
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
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
import { useTripTicker } from "../../src/hooks/useTripTicker";
import { haversineMeters, pointAtProgress, formatDistanceKm, formatEta, Route } from "../../src/lib/location";
import { DeliveryTrip, LatLng } from "../../constants/types";

export default function LiveMapTracking() {
  const router = useRouter();
  const { session, trips, getActiveTripForSupplier, markStopDelivered, routes } = useStore();
  const user = session?.user!;
  const activeTrip = getActiveTripForSupplier(user.id);

  // Drive the animation only if a trip exists.
  useTripTicker(activeTrip?.id);

  // Hooks must be called unconditionally — pull everything we need
  // before any early return.
  const trip = activeTrip as DeliveryTrip | undefined;
  const route = trip ? routes.find((r) => r.id === trip.routeId) : undefined;
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
    const dist = haversineMeters(supplierPos, { lat: nextStop.lat, lng: nextStop.lng });
    const seconds = (dist / 1000) / 30 * 3600; // ~30 km/h
    return { dist, seconds };
  }, [nextStop, supplierPos]);

  if (!trip || !supplierPos) {
    return (
      <SidebarLayout>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
          <View style={styles.header}>
            <DrawerMenuButton />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Live Map Tracking</Text>
              <Text style={styles.subtitle}>No active trip</Text>
            </View>
          </View>
          <View style={{ padding: Spacing.lg }}>
            <EmptyState
              icon="📍"
              title="No active trip"
              message="Start a delivery to see live tracking here."
              action={
                <AppButton
                  title="Start delivery"
                  variant="primary"
                  onPress={() => router.push("/(supplier)/start-delivery" as any)}
                />
              }
            />
            {trips.length > 0 ? (
              <Card style={{ marginTop: Spacing.lg }}>
                <Text style={styles.sectionTitle}>Recent trip</Text>
                <Text style={styles.subtitle}>
                  {trips[0].routeName} on {trips[0].date}
                </Text>
                <Text style={styles.subtitle}>
                  Status: {trips[0].status.replace("_", " ")}
                </Text>
              </Card>
            ) : null}
          </View>
        </SafeAreaView>
      </SidebarLayout>
    );
  }

  const served = trip.stops.filter((s) => s.status === "delivered").length;

  return (
    <SidebarLayout>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
        <View style={styles.header}>
          <DrawerMenuButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{trip.routeName} route</Text>
            <Text style={styles.subtitle}>
              {trip.vehiclePlate} • {trip.riderName}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
          <View style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.sm }}>
            <LogisticsMap
              stops={trip.stops}
              polyline={polyline}
              supplier={supplierPos}
              height={260}
            />
          </View>

          {/* ETA banner */}
          <Card style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.md }}>
            <View style={styles.row}>
              <View style={styles.etaBlock}>
                <Text style={styles.etaLabel}>Progress</Text>
                <Text style={styles.etaValue}>{Math.round(trip.progress * 100)}%</Text>
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
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(trip.progress * 100)}%` },
                ]}
              />
            </View>
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
                    style={{ paddingHorizontal: Spacing.md, paddingVertical: 8 }}
                    onPress={() => markStopDelivered(trip.id, s.sellerId)}
                  />
                ) : null}
              </View>
              {s.status !== "delivered" ? (
                <View style={{ marginTop: Spacing.sm }}>
                  <TripTimeline status={s.status} compact />
                </View>
              ) : (
                <View style={styles.deliveredRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  <Text style={styles.deliveredText}>
                    Delivered {s.deliveredAt ? `at ${new Date(s.deliveredAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}
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
                All {trip.stops.length} sellers have been served. The {trip.routeName} route is finished for today.
              </Text>
            </Card>
          ) : null}
        </ScrollView>
      </SafeAreaView>
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
  title: { fontSize: FontSize.xl, fontWeight: "800", color: Colors.text },
  subtitle: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center" },
  etaBlock: { flex: 1, alignItems: "center" },
  etaLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  etaValue: { color: Colors.text, fontSize: FontSize.lg, fontWeight: "800", marginTop: 2 },
  etaSub: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2, fontWeight: "600" },
  etaDivider: { width: 1, height: 36, backgroundColor: Colors.border },
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
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  stopCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
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
  stopSeqText: { color: Colors.supplier, fontWeight: "800", fontSize: FontSize.md },
  stopName: { fontSize: FontSize.md, fontWeight: "800", color: Colors.text },
  stopAddress: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
  deliveredRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  deliveredText: { color: Colors.success, fontSize: FontSize.xs, fontWeight: "700", marginLeft: 4 },
  completeTitle: { fontSize: FontSize.lg, fontWeight: "800", color: Colors.success, marginBottom: 4 },
  completeSub: { color: Colors.text, fontSize: FontSize.sm },
});