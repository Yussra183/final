/**
 * src/components/LiveDeliveryTracker.tsx
 *
 * Bolt/Uber-style "Live Delivery Tracker" surface for both the customer
 * and seller sides. Reads from {@link useOrderTracking} and renders:
 *
 *   • Status pill (Rider Assigned / Picked Up / In Transit / Delivered)
 *   • Live map (rider marker + origin/destination + polyline)
 *   • Distance remaining + ETA (computed from the latest rider position)
 *   • Connection status (LIVE / Reconnecting / Waiting for first signal)
 *
 * The component is presentation-only — it does NOT talk to the socket
 * itself. Pass the {@link useOrderTracking} result in via props so the
 * parent screen owns the React effect lifecycle and the auth token.
 */
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "./Card";
import { LiveTrackingMap } from "./LiveTrackingMap";
import { PulseDot, Spin } from "./MicroAnimations";
import { LatLng, formatDistanceKm, formatEta, haversineMeters, computeRoute } from "../lib/location";
import type { OrderTrackingState, TrackingConnectionState } from "../hooks/useOrderTracking";

export type LiveRole = "customer" | "seller";

export interface LiveDeliveryTrackerProps {
  /** Source of truth for the live rider position. */
  tracking: OrderTrackingState;
  /** Origin marker — seller's shop or supplier depot. */
  origin: LatLng;
  /** Destination marker — customer address or seller's shop. */
  destination: LatLng;
  /** Map height. Default 240. */
  height?: number;
  /** Optional override for the rider marker label. */
  liveLabel?: string;
  /** Origin label. Default: "Shop" / "Depot". */
  originLabel?: string;
  /** Destination label. Default: "Customer" / "Shop". */
  destinationLabel?: string;
  /**
   * Estimated rider speed in m/s for the ETA fallback when the rider
   * has not yet sent a sample. Default 8.3 (~30 km/h urban scooter).
   */
  fallbackSpeedMps?: number;
  /** "customer" or "seller" — controls verb tense + copy. */
  role: LiveRole;
  /** Optional: order status (e.g. `assigned`, `in_transit`) for the pill. */
  orderStatus?:
    | "pending"
    | "accepted"
    | "assigned"
    | "picked_up"
    | "in_transit"
    | "delivered"
    | "cancelled"
    | "rejected";
  /** Optional: rider name shown on the card. */
  riderName?: string | null;
}

const PILL_TONE: Record<
  string,
  { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap; label: string }
> = {
  assigned: { bg: "#DBEAFE", fg: "#1D4ED8", icon: "person-outline", label: "Rider Assigned" },
  picked_up: { bg: "#DBEAFE", fg: "#1D4ED8", icon: "person-outline", label: "Rider Assigned" },
  in_transit: { bg: "#FEF3C7", fg: "#B45309", icon: "bicycle-outline", label: "On the Way" },
  delivered: { bg: "#DCFCE7", fg: "#047857", icon: "checkmark-circle-outline", label: "Delivered" },
  waiting: { bg: "#E5E7EB", fg: "#374151", icon: "hourglass-outline", label: "Waiting for first signal" },
};

function deriveLiveLabel(
  status: LiveDeliveryTrackerProps["orderStatus"],
  connection: TrackingConnectionState,
  hasFix: boolean,
): { label: string; tone: { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap } } {
  if (!hasFix) return { label: PILL_TONE.waiting.label, tone: PILL_TONE.waiting };
  if (status === "delivered") return { label: PILL_TONE.delivered.label, tone: PILL_TONE.delivered };
  if (status === "in_transit") return { label: PILL_TONE.in_transit.label, tone: PILL_TONE.in_transit };
  return { label: PILL_TONE.assigned.label, tone: PILL_TONE.assigned };
}

export function LiveDeliveryTracker({
  tracking,
  origin,
  destination,
  height = 240,
  liveLabel = "Rider",
  originLabel,
  destinationLabel,
  fallbackSpeedMps = 8.3,
  role,
  orderStatus,
  riderName,
}: LiveDeliveryTrackerProps) {
  const hasFix = tracking.riderLatLng !== null;
  const pill = deriveLiveLabel(orderStatus, tracking.connection, hasFix);

  // Compute the polyline once per origin/destination.
  const route = useMemo(() => computeRoute(origin, destination), [origin, destination]);

  // Distance + ETA derived from the latest rider position. When we
  // don't have a fix yet we fall back to the full great-circle
  // distance + a duration extrapolated from the fallback speed so the
  // customer sees a non-zero ETA instead of a blank card.
  const distanceMeters = tracking.riderLatLng
    ? haversineMeters(tracking.riderLatLng, destination)
    : route.distanceMeters;
  const etaSeconds = tracking.riderLatLng
    ? Math.round(distanceMeters / fallbackSpeedMps)
    : Math.round(route.distanceMeters / fallbackSpeedMps);

  const isDelivered = orderStatus === "delivered";

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="navigate-outline" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>
              {role === "customer" ? "Live Rider Tracking" : "Rider Live Tracking"}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {riderName ? `${riderName}` : role === "customer" ? "Your delivery" : "In flight"}
            </Text>
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: pill.tone.bg }]}>
          <Ionicons name={pill.tone.icon} size={12} color={pill.tone.fg} />
          <Text style={[styles.statusText, { color: pill.tone.fg }]}>{pill.label}</Text>
        </View>
      </View>

      <LiveTrackingMap
        origin={origin}
        live={tracking.riderLatLng ?? origin}
        destination={destination}
        route={route.polyline.length > 1 ? route.polyline : undefined}
        height={height}
        liveLabel={liveLabel}
        originLabel={originLabel}
        destinationLabel={destinationLabel}
        style={styles.map}
      />

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>{formatDistanceKm(distanceMeters)}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>ETA</Text>
          <View style={styles.etaRow}>
            {isDelivered ? (
              <Text style={[styles.statValue, { color: PILL_TONE.delivered.fg }]}>Delivered</Text>
            ) : (
              <>
                <PulseDot size={8} color={pill.tone.fg} />
                <Text style={[styles.statValue, { color: pill.tone.fg }]}>
                  {formatEta(etaSeconds)}
                </Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Live</Text>
          <View style={styles.connectionRow}>
            {tracking.connection === "open" ? (
              <PulseDot size={8} color={Colors.success} />
            ) : tracking.connection === "reconnecting" ? (
              <Spin name="refresh" size={10} color={Colors.warning} />
            ) : (
              <Ionicons name="ellipsis-horizontal" size={12} color={Colors.textMuted} />
            )}
            <Text
              style={[
                styles.statValue,
                {
                  color:
                    tracking.connection === "open"
                      ? Colors.success
                      : tracking.connection === "reconnecting"
                        ? Colors.warning
                        : Colors.textMuted,
                  fontSize: FontSize.sm,
                },
              ]}
              numberOfLines={1}
            >
              {tracking.connection === "open"
                ? hasFix
                  ? "Live"
                  : "Connected"
                : tracking.connection === "reconnecting"
                  ? "Reconnecting"
                  : "Connecting"}
            </Text>
          </View>
        </View>
      </View>

      {/* Rider fix detail */}
      {tracking.riderLatLng ? (
        <View style={styles.fixRow}>
          <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.fixText} numberOfLines={1}>
            {tracking.riderLatLng.lat.toFixed(5)}, {tracking.riderLatLng.lng.toFixed(5)}
            {tracking.ts ? ` · ${new Date(tracking.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.md, padding: Spacing.md },
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
  headerTitle: { fontSize: FontSize.md, fontWeight: "800", color: Colors.text },
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
  map: { marginBottom: Spacing.sm },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statBox: { flex: 1, paddingHorizontal: Spacing.xs },
  statDivider: { width: 1, height: 32, backgroundColor: Colors.border },
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
  connectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  fixRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.xs,
  },
  fixText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
    flex: 1,
  },
});