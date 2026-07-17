/**
 * src/components/LiveRiderTracker.tsx
 *
 * Self-contained "Live Rider Tracking" card used by the customer's
 * Order screen when an order is in flight. It bundles:
 *
 *   • Status pill (Rider Assigned / On the Way / Arrived)
 *   • Stylised map with rider position + planned polyline
 *   • ETA + distance remaining
 *   • Order-level meta (rider name, phone hint)
 *
 * Internal logic ticks every 4 seconds to simulate live motion; the
 * rider position interpolates along the planned polyline based on a
 * "delivery progress" value derived from the order status. When the
 * order is delivered, the card shows the "Arrived" state without
 * animating further. Tick pauses on unmount.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "./Card";
import { LiveTrackingMap, LatLng } from "./LiveTrackingMap";
import { PulseDot, Spin } from "./MicroAnimations";
import { haversineMeters, computeRoute, formatEta, formatDistanceKm } from "../lib/location";

export type RiderLiveStatus = "Rider Assigned" | "On the Way" | "Arrived";

export interface LiveRiderTrackerProps {
  orderId: string;
  riderName: string;
  riderPhone?: string;
  /** Status of the underlying order. */
  orderStatus:
    | "pending"
    | "accepted"
    | "assigned"
    | "picked_up"
    | "in_transit"
    | "delivered"
    | "cancelled"
    | "rejected";
  /** Origin coordinates (e.g. seller's shop). Defaults to a stable Zanzibar pin. */
  origin?: LatLng;
  /** Destination coordinates (customer). Defaults to Mikocheni, Dar es Salaam. */
  destination?: LatLng;
}

/** Stable fallbacks so the map never crashes on missing location. */
const FALLBACK_ORIGIN: LatLng = { lat: -6.1629, lng: 39.2026 }; // Zanzibar
const FALLBACK_DEST: LatLng = { lat: -6.76, lng: 39.24 }; // Mikocheni, Dar

/**
 * Derive the current leg of the trip (0..1) from the order status.
 *  - assigned    → rider just picked up the order
 *  - picked_up   → rider is at the shop
 *  - in_transit  → rider is somewhere along the route
 *  - delivered   → arrived
 */
function deriveProgress(status: LiveRiderTrackerProps["orderStatus"]): number {
  switch (status) {
    case "assigned":
      return 0.05;
    case "picked_up":
      return 0.1;
    case "in_transit":
      return 0.55;
    case "delivered":
      return 1;
    default:
      return 0;
  }
}

/**
 * Map the order status to the public status shown on the card. The
 * three labels mirror "Rider Assigned / On the Way / Arrived".
 */
function deriveLiveStatus(
  status: LiveRiderTrackerProps["orderStatus"],
): RiderLiveStatus {
  if (status === "delivered") return "Arrived";
  if (status === "assigned" || status === "picked_up") return "Rider Assigned";
  return "On the Way";
}

const TONE: Record<RiderLiveStatus, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  "Rider Assigned": { bg: "#DBEAFE", fg: "#1D4ED8", icon: "person-outline" },
  "On the Way": { bg: "#FEF3C7", fg: "#B45309", icon: "bicycle-outline" },
  Arrived: { bg: "#DCFCE7", fg: "#047857", icon: "checkmark-circle-outline" },
};

export function LiveRiderTracker({
  orderId,
  riderName,
  riderPhone,
  origin = FALLBACK_ORIGIN,
  destination = FALLBACK_DEST,
  orderStatus,
}: LiveRiderTrackerProps) {
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulate a live rider position by incrementing a tick counter; the
  // progress bumps slowly while the order is in transit so the rider
  // dot visibly moves along the route.
  useEffect(() => {
    if (orderStatus === "delivered" || orderStatus === "cancelled") {
      setTick((v) => v); // freeze
      return;
    }
    intervalRef.current = setInterval(() => {
      setTick((v) => v + 1);
    }, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [orderStatus]);

  // Compute the planned route once per origin/destination. We could
  // memoize but the operation is cheap.
  const route = useMemo(() => computeRoute(origin, destination), [origin, destination]);

  // Live progress: start at the order-derived baseline and advance
  // 0.02 every 4 seconds, capped at 0.95 unless status = delivered.
  const baseProgress = deriveProgress(orderStatus);
  const liveProgress = useMemo(() => {
    if (orderStatus === "delivered") return 1;
    if (orderStatus === "cancelled") return baseProgress;
    const advanced = Math.min(0.95, baseProgress + tick * 0.02);
    return advanced;
  }, [baseProgress, tick, orderStatus]);

  // Interpolate the rider position along the polyline.
  const riderPos = useMemo(() => {
    const poly = route.polyline;
    const total = poly.length - 1;
    const idx = Math.max(0, Math.min(total, liveProgress * total));
    const i0 = Math.floor(idx);
    const i1 = Math.min(total, i0 + 1);
    const f = idx - i0;
    const a = poly[i0];
    const b = poly[i1];
    return {
      lat: a.lat + (b.lat - a.lat) * f,
      lng: a.lng + (b.lng - a.lng) * f,
    };
  }, [route, liveProgress]);

  // Distance + ETA from the rider to the destination.
  const remainingMeters = haversineMeters(riderPos, destination);
  const etaSeconds =
    orderStatus === "delivered"
      ? 0
      : Math.round(remainingMeters / (30000 / 3600)); // ~30 km/h

  const status: RiderLiveStatus = deriveLiveStatus(orderStatus);
  const tone = TONE[status];

  const callRider = () => {
    if (!riderPhone) return;
    Linking.openURL(`tel:${riderPhone}`).catch(() => {});
  };

  return (
    <Card style={styles.card}>
      {/* ---------- Header ---------- */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="navigate-outline" size={18} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Live Rider Tracking</Text>
            <Text style={styles.headerSubtitle}>
              Order #{orderId.slice(-4)} • {riderName}
            </Text>
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Ionicons name={tone.icon} size={12} color={tone.fg} />
          <Text style={[styles.statusText, { color: tone.fg }]}>{status}</Text>
        </View>
      </View>

      {/* ---------- Map ---------- */}
      <LiveTrackingMap
        origin={origin}
        rider={riderPos}
        destination={destination}
        height={180}
        style={styles.map}
      />

      {/* ---------- Footer: distance, ETA, contact ---------- */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>
            {formatDistanceKm(remainingMeters)}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>ETA</Text>
          <View style={styles.etaRow}>
            {orderStatus === "delivered" ? (
              <Text style={[styles.statValue, { color: TONE.Arrived.fg }]}>
                Delivered
              </Text>
            ) : (
              <>
                <PulseDot size={8} color={tone.fg} />
                <Text style={[styles.statValue, { color: tone.fg }]}>
                  {formatEta(etaSeconds)}
                </Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Status</Text>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(liveProgress * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.progressPct}>
              {Math.round(liveProgress * 100)}%
            </Text>
          </View>
        </View>
      </View>

      {/* ---------- Rider CTA ---------- */}
      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.footerBtn, { backgroundColor: Colors.surfaceMuted }]}
          onPress={() => setTick((v) => v + 1)}
        >
          <Spin name="refresh" size={14} color={Colors.primary} />
          <Text style={[styles.footerBtnText, { color: Colors.primary }]}>
            Refresh
          </Text>
        </TouchableOpacity>
        {riderPhone ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.footerBtn, { backgroundColor: Colors.primary }]}
            onPress={callRider}
          >
            <Ionicons name="call-outline" size={14} color="#FFF" />
            <Text style={[styles.footerBtnText, { color: "#FFF" }]}>
              Call Rider
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  map: {
    marginBottom: Spacing.sm,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statBox: {
    flex: 1,
    paddingHorizontal: Spacing.xs,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: "800",
    marginTop: 2,
  },
  etaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 999,
  },
  progressPct: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.primary,
    width: 36,
    textAlign: "right",
  },
  footer: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  footerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  footerBtnText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
});
