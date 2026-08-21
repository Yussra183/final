/**
 * Supplier → Live Delivery
 *
 * The supplier's in-flight delivery surface. Reads the active trip via
 * `getActiveTripForSupplier`, opens a trip-channel WebSocket
 * subscription through {@link useTripTracking}, and runs the supplier's
 * own GPS through {@link useTripGpsPublisher} so the same device also
 * serves as the rider position source (backend already authorises the
 * owning supplier to publish on the trip channel).
 *
 * What the supplier sees:
 *
 *   • Status pill fed from the socket connection state
 *     (LIVE / Reconnecting / Connecting / Idle)
 *   • Live map of the planned route — the truck pin follows the rider
 *     GPS in real time, every stop is rendered with per-status
 *     colouring (delivered / on-the-way / near-shop / scheduled), and
 *     a 500 m halo communicates "live".
 *   • Trip meta strip — rider, vehicle, supervisor — read off the
 *     `DeliveryTrip` (which mirrors the server's `ServerDeliveryTrip`).
 *   • Per-seller list with distance and ETA computed live from the
 *     rider position; delivered rows swap their ETA for a timestamp.
 *
 * Empty states:
 *
 *   • No active trip → "Start a delivery from Delivery Operations to
 *     see live tracking here." plus a shortcut back to Operations.
 *   • Active trip with no GPS yet → the map anchors on the first
 *     stop; ETA column renders "—" until the rider publishes.
 *   • Location permission denied → rider pin parks on the first stop
 *     and ETA column shows "—"; no crash, no retry loop.
 */
import React, { useCallback, useEffect, useMemo } from "react";
import {
  Alert,
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
import { AppButton } from "../../src/components/AppButton";
import { SidebarLayout } from "../../src/components/SidebarLayout";
import { EmptyState } from "../../src/components/EmptyState";
import { LogisticsMap } from "../../src/components/LogisticsMap";
import { useTripTracking } from "../../src/hooks/useTripTracking";
import { useTripGpsPublisher } from "../../src/hooks/useTripGpsPublisher";
import {
  formatDistanceKm,
  formatEta,
  haversineMeters,
  LatLng,
} from "../../src/lib/location";
import { DeliveryTrip, RouteStop, StopStatus } from "../../constants/types";

/** ~30 km/h average urban speed — matches LiveDeliveryTracker + computeRoute. */
const URBAN_SPEED_M_PER_S = 8.3;

/**
 * Map the existing {@link StopStatus} union onto user-facing copy +
 * pill tone. The underlying union uses the supplier-route vocabulary
 * (`on_the_way`, `near_shop`); this UI shows the customer-side
 * ("On the way", "Near shop") so the supplier doesn't have to learn
 * the internal state names.
 */
function stopStatusCopy(
  status: StopStatus,
): { label: string; tone: "success" | "info" | "warning" | "muted" } {
  switch (status) {
    case "delivered":
      return { label: "Delivered", tone: "success" };
    case "near_shop":
      return { label: "Near shop", tone: "warning" };
    case "on_the_way":
    case "started":
      return { label: "On the way", tone: "info" };
    default:
      return { label: "Scheduled", tone: "muted" };
  }
}

export default function SupplierLive() {
  return (
    <SidebarLayout>
      <LiveContent />
    </SidebarLayout>
  );
}

function LiveContent() {
  const router = useRouter();
  const {
    session,
    routes,
    getActiveTripForSupplier,
  } = useStore();

  const supplierId = session?.user?.id;
  const liveTrip = supplierId
    ? getActiveTripForSupplier(supplierId)
    : undefined;
  const tripId = liveTrip?.id ?? null;
  const token = session?.token ?? null;

  // --- Subscriber half (read): trip-channel WS -> rider position ----
  const tracking = useTripTracking({ tripId, token });

  // --- Publisher half (write): supplier's GPS -> trip channel -------
  const publisher = useTripGpsPublisher({
    tripId,
    token,
    onPermissionDenied: (reason) => {
      // Don't block the rest of the screen — just let the user know.
      // The map will park the rider pin on the first stop and the ETA
      // column will render "—".
      if (__DEV__) {
        console.warn("[LIVE_DELIVERY][GPS_PERMISSION_DENIED]", reason);
      }
    },
  });

  // Begin publishing on mount when a trip is active. Idempotent.
  useEffect(() => {
    if (tripId && token) {
      publisher.start().catch((e: unknown) => {
        if (__DEV__) {
          console.warn(
            "[LIVE_DELIVERY][GPS_START_FAILED]",
            e instanceof Error ? e.message : e,
          );
        }
      });
    }
    return () => publisher.stop();
    // publisher's start/stop are stable refs — the effect only re-runs
    // when the trip identity actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, token]);

  // --- Lookups the per-seller list + map need -----------------------
  const route = useMemo(
    () =>
      liveTrip ? routes.find((r) => r.id === liveTrip.routeId) : undefined,
    [liveTrip, routes],
  );
  const polyline = useMemo<LatLng[]>(
    // `DeliveryTrip` carries no polyline; reach into the route row.
    () => route?.polyline ?? [],
    [route],
  );
  const stops = useMemo<RouteStop[]>(
    () => (liveTrip?.stops ?? []).slice().sort((a, b) => a.sequence - b.sequence),
    [liveTrip],
  );
  // Map anchor: prefer live rider position; fall back to the first
  // stop; final fallback is Stone Town so the map never crashes on
  // empty state.
  const fallbackAnchor: LatLng =
    stops[0] != null
      ? { lat: stops[0].lat, lng: stops[0].lng }
      : { lat: -6.1629, lng: 39.2026 };
  const mapAnchor: LatLng = tracking.riderLatLng ?? fallbackAnchor;

  // --- Empty states --------------------------------------------------
  if (!liveTrip) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Live Delivery</Text>
            <Text style={styles.subtitle}>
              See your rider in real time on every active trip
            </Text>
          </View>
        </View>
        <EmptyState
          iconName="navigate-circle-outline"
          title="No active delivery"
          message="Start a delivery from Delivery Operations to see live tracking here."
          action={
            <AppButton
              title="Open Delivery Operations"
              variant="primary"
              onPress={() => router.push("/(supplier)/operations" as any)}
            />
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: Spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Live Delivery</Text>
            <Text style={styles.subtitle}>
              {liveTrip.routeName} route · {stops.length} stop
              {stops.length === 1 ? "" : "s"}
            </Text>
          </View>
          <ConnectionPill state={tracking.connection} />
        </View>

        {/* The map */}
        <View style={{ marginHorizontal: Spacing.lg }}>
          <Card style={styles.mapCard}>
            <LogisticsMap
              stops={stops}
              polyline={polyline}
              supplier={mapAnchor}
              height={280}
            />
          </Card>
        </View>

        {/* Trip meta */}
        <View style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.md }}>
          <Card>
            <View style={styles.metaRow}>
              <View style={styles.metaIconBubble}>
                <Ionicons
                  name="person-circle-outline"
                  size={18}
                  color={Colors.supplier}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.metaLabel}>Rider</Text>
                <Text style={styles.metaValue} numberOfLines={1}>
                  {liveTrip.riderName || "Not assigned"}
                </Text>
              </View>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaRow}>
              <View style={styles.metaIconBubble}>
                <Ionicons
                  name="car-sport-outline"
                  size={18}
                  color={Colors.supplier}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.metaLabel}>Vehicle</Text>
                <Text style={styles.metaValue} numberOfLines={1}>
                  {liveTrip.vehiclePlate || "Not assigned"}
                </Text>
              </View>
            </View>
            {route?.supervisorName ? (
              <>
                <View style={styles.metaDivider} />
                <View style={styles.metaRow}>
                  <View style={styles.metaIconBubble}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={18}
                      color={Colors.supplier}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.metaLabel}>Supervisor</Text>
                    <Text style={styles.metaValue} numberOfLines={1}>
                      {route.supervisorName}
                      {route.supervisorPhone
                        ? ` · ${route.supervisorPhone}`
                        : ""}
                    </Text>
                  </View>
                </View>
              </>
            ) : null}
          </Card>
        </View>

        {/* Per-seller list */}
        <View style={styles.sectionHeader}>
          <Ionicons
            name="location-outline"
            size={16}
            color={Colors.supplier}
          />
          <Text style={styles.sectionTitle}>Stops</Text>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>
              {stops.filter((s) => s.status === "delivered").length}/
              {stops.length} done
            </Text>
          </View>
        </View>
        <View style={{ marginHorizontal: Spacing.lg }}>
          {stops.map((stop) => (
            <StopRow
              key={stop.sellerId}
              stop={stop}
              riderLatLng={tracking.riderLatLng}
            />
          ))}
        </View>

        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md }}>
          <AppButton
            title="Back to Operations"
            variant="outline"
            fullWidth
            leftIcon={
              <Ionicons name="arrow-back" size={14} color={Colors.supplier} />
            }
            onPress={() => router.push("/(supplier)/operations" as any)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */

function ConnectionPill({
  state,
}: {
  state: ReturnType<typeof useTripTracking>["connection"];
}) {
  let label = "Idle";
  let tone: "success" | "info" | "warning" | "muted" = "muted";
  let dotColor = Colors.textMuted;
  switch (state) {
    case "open":
      label = "LIVE";
      tone = "success";
      dotColor = Colors.success;
      break;
    case "connecting":
      label = "Connecting…";
      tone = "info";
      dotColor = Colors.info;
      break;
    case "reconnecting":
      label = "Reconnecting";
      tone = "warning";
      dotColor = Colors.warning;
      break;
    default:
      label = "Idle";
      tone = "muted";
      dotColor = Colors.textMuted;
  }
  return (
    <View style={[styles.pill, { backgroundColor: toneBg(tone) }]}>
      <View style={[styles.pillDot, { backgroundColor: dotColor }]} />
      <Text style={[styles.pillLabel, { color: toneFg(tone) }]}>
        {label}
      </Text>
    </View>
  );
}

function toneBg(tone: "success" | "info" | "warning" | "muted"): string {
  switch (tone) {
    case "success":
      return "#ECFDF5";
    case "info":
      return "#EEF2FF";
    case "warning":
      return "#FEF3C7";
    default:
      return "#F1F5F9";
  }
}
function toneFg(tone: "success" | "info" | "warning" | "muted"): string {
  switch (tone) {
    case "success":
      return Colors.success;
    case "info":
      return Colors.info;
    case "warning":
      return Colors.warning;
    default:
      return Colors.textSecondary;
  }
}

function StopRow({
  stop,
  riderLatLng,
}: {
  stop: RouteStop;
  riderLatLng: LatLng | null;
}) {
  const origin: LatLng = riderLatLng ?? { lat: stop.lat, lng: stop.lng };
  const meters = haversineMeters(origin, { lat: stop.lat, lng: stop.lng });
  const etaSeconds = meters / URBAN_SPEED_M_PER_S;
  const copy = stopStatusCopy(stop.status);
  const isDelivered = stop.status === "delivered";
  const isWaitingOnGps = !riderLatLng && !isDelivered;

  return (
    <Card style={styles.stopCard}>
      <View style={styles.stopHeader}>
        <View
          style={[
            styles.stopSeqBubble,
            { backgroundColor: isDelivered ? Colors.success : Colors.supplier },
          ]}
        >
          <Text style={styles.stopSeqText}>{stop.sequence}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.stopName} numberOfLines={1}>
            {stop.sellerName}
          </Text>
          <Text style={styles.stopAddress} numberOfLines={1}>
            {stop.address}
          </Text>
        </View>
        <View
          style={[styles.stopStatusPill, { backgroundColor: toneBg(copy.tone) }]}
        >
          <Text style={[styles.stopStatusText, { color: toneFg(copy.tone) }]}>
            {copy.label}
          </Text>
        </View>
      </View>
      <View style={styles.stopFooter}>
        <View style={styles.stopFooterItem}>
          <Ionicons
            name="navigate-outline"
            size={14}
            color={Colors.textSecondary}
          />
          <Text style={styles.stopFooterLabel}>Distance</Text>
          <Text style={styles.stopFooterValue}>
            {isDelivered || isWaitingOnGps ? "—" : formatDistanceKm(meters)}
          </Text>
        </View>
        <View style={styles.stopFooterDivider} />
        <View style={styles.stopFooterItem}>
          <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.stopFooterLabel}>ETA</Text>
          <Text style={styles.stopFooterValue}>
            {isDelivered
              ? formatDeliveredTime(stop.deliveredAt)
              : isWaitingOnGps
                ? "—"
                : formatEta(etaSeconds)}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function formatDeliveredTime(iso?: string): string {
  if (!iso) return "Delivered";
  // Accept ISO and extract HH:MM for a stable display; fall back to
  // the raw substring so we never crash on an unknown format.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Delivered";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `Delivered ${hh}:${mm}`;
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.text,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  pillLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  mapCard: {
    padding: 0,
    overflow: "hidden",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: Spacing.sm,
  },
  metaIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metaValue: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 2,
  },
  metaDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    gap: 6,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    flex: 1,
  },
  sectionCount: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: "#EEF2FF",
  },
  sectionCountText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.supplier,
    letterSpacing: 0.4,
  },
  stopCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  stopHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  stopSeqBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  stopSeqText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: FontSize.xs,
  },
  stopName: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  stopAddress: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
    marginTop: 2,
  },
  stopStatusPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  stopStatusText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  stopFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  stopFooterItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stopFooterDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.sm,
  },
  stopFooterLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  stopFooterValue: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
    marginLeft: 2,
  },
});