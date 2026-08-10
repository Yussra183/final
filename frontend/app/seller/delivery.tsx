/**
 * Seller → Delivery Tracking Module
 *
 * Production-ready screen that lets the seller monitor every active
 * delivery in real time. The screen shows the spec's lifecycle:
 *
 *   Step 1  Order accepted → "Waiting for Rider"
 *   Step 2  Broadcast to online+available+rider within radius
 *   Step 3  First rider wins (lock the order, drop it from other
 *           riders' queues)
 *   Step 4  Live tracking: rider location, route, ETA
 *   Step 5  Status timeline
 *   Step 6  Map with markers + polyline
 *   Step 7  Turn-by-turn directions
 *   Step 8  Auto-flip to "Delivered" when rider reaches customer
 *
 * Architecture:
 *
 *   • `src/lib/location.ts`            — Haversine, ETA, route geometry
 *   • `src/hooks/useDeliveryTracking.ts` — single source of truth,
 *                                          driven by `useOrderTracking`'s
 *                                          WebSocket feed and the
 *                                          backend's `Order.status`.
 *   • `src/hooks/useSellerLocation.ts`  — shop coordinates
 *   • `src/components/DeliveryMap.tsx`  — pin/polyline placeholder
 *
 * All active deliveries are sourced from the live store — there is no
 * local mock pool. When no in-flight orders exist the screen surfaces
 * the standard empty state.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { SellerHeader } from "../../src/components/SellerHeader";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import { EmptyState } from "../../src/components/EmptyState";
import { DeliveryMap } from "../../src/components/DeliveryMap";
import {
  TIMELINE_STEPS,
  stepIndex,
  useDeliveryTracking,
  type DeliveryStatus,
} from "../../src/hooks/useDeliveryTracking";
import { useSellerLocation } from "../../src/hooks/useSellerLocation";
import { useStore } from "../../src/store/StoreContext";
import {
  LatLng,
  computeRoute,
  formatDistanceKm,
  formatEta,
  toLatLng,
} from "../../src/lib/location";
import { Order } from "../../constants/types";

interface ActiveDelivery {
  order: Order;
  customer: LatLng;
  gasType: string;
  cylinderSize: string;
  quantity: number;
}

/* -------------------------------------------------------------------------- */
/* Components                                                                 */
/* -------------------------------------------------------------------------- */

function StatBox({
  icon,
  value,
  label,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.statBox}>
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label} </Text>
      </View>
    </View>
  );
}

function StatusTimeline({ status }: { status: DeliveryStatus }) {
  const currentIdx = stepIndex(status);
  return (
    <View style={styles.timeline}>
      {TIMELINE_STEPS.map((step, i) => {
        const reached = i <= currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <View key={step.key} style={styles.timelineRow}>
            <View style={styles.timelineDotCol}>
              <View
                style={[
                  styles.timelineDot,
                  reached && { backgroundColor: step.color, borderColor: step.color },
                  isCurrent && styles.timelineDotCurrent,
                ]}
              >
                <Ionicons
                  name={step.icon as keyof typeof Ionicons.glyphMap}
                  size={13}
                  color={reached ? Colors.textInverse : Colors.textMuted}
                />
              </View>
              {i < TIMELINE_STEPS.length - 1 ? (
                <View
                  style={[
                    styles.timelineLine,
                    reached && i < currentIdx && { backgroundColor: step.color },
                  ]}
                />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: Spacing.md }}>
              <Text
                style={[
                  styles.timelineLabel,
                  reached && { color: Colors.text },
                  isCurrent && { color: step.color, fontWeight: "800" },
                ]}
              >
                {step.label}
              </Text>
              {isCurrent ? (
                <Text style={[styles.timelineHint, { color: step.color }]}>In progress…</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function DeliveryCard({
  delivery,
  expanded,
  onToggle,
  sessionToken,
}: {
  delivery: ActiveDelivery;
  expanded: boolean;
  onToggle: () => void;
  sessionToken: string | null;
}) {
  const { order, customer, gasType, cylinderSize, quantity } = delivery;
  const shopCoords = useSellerLocation();

  const route = useMemo(() => {
    if (!expanded) return null;
    return computeRoute(shopCoords, customer);
  }, [expanded, shopCoords, customer]);

  const { state, cancel } = useDeliveryTracking({
    order: {
      orderId: order.id,
      sellerId: order.sellerId,
      sellerName: order.sellerName,
      shopLatLng: shopCoords,
      customerLatLng: customer,
      order,
      token: sessionToken,
    },
    route,
  });

  const isDelivered = state.status === "delivered";
  const isWaiting = state.status === "waiting_for_rider";

  /**
   * Confirms before cancelling — orders.tsx and inventory.tsx already do this
   * for destructive ops. Cancelling an in-flight delivery is destructive: a
   * mis-tap cancels a customer's order.
   */
  const confirmCancel = () => {
    Alert.alert(
      "Cancel delivery?",
      `This will cancel the in-flight order for ${order.customerName}.`,
      [
        { text: "Keep delivery", style: "cancel" },
        {
          text: "Cancel delivery",
          style: "destructive",
          onPress: cancel,
        },
      ],
    );
  };

  return (
    <Card style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderNumber}>#{order.id.slice(-4).toUpperCase()}</Text>
          <Text style={styles.customerName}>{order.customerName}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="flame-outline" size={13} color={Colors.accent} />
            <Text style={styles.metaText}>
              {gasType} • {cylinderSize} • Qty {quantity}
            </Text>
          </View>
        </View>
        <StatusPill
          label={statusLabel(state.status)}
          tone={statusTone(state.status)}
        />
      </View>

      {/* Quick stats row — distance / ETA */}
      <View style={styles.quickStats}>
        <StatBox
          icon="navigate-outline"
          value={isWaiting ? "—" : formatDistanceKm(state.distanceRemainingM)}
          label="Distance"
          color={Colors.primary}
        />
        <StatBox
          icon="time-outline"
          value={isWaiting ? "—" : formatEta(state.etaSeconds)}
          label="ETA"
          color={Colors.accent}
        />
      </View>

      {/* Assigned rider info */}
      {state.rider ? (
        <View style={styles.riderBox}>
          <View style={[styles.riderAvatar, { backgroundColor: Colors.accent + "22" }]}>
            <Ionicons name="bicycle" size={22} color={Colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.riderName}>{state.rider.fullName}</Text>
            <Text style={styles.riderPhone}>{state.rider.phone || "—"}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <View style={styles.riderRating}>
              <Ionicons name="star" size={12} color={Colors.warning} />
              <Text style={styles.riderRatingText}>{state.rider.rating ?? "—"}</Text>
            </View>
            {state.rider.vehicle ? (
              <Text style={styles.riderVehicle}>{state.rider.vehicle}</Text>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.waitingBox}>
          <Ionicons name="hourglass-outline" size={18} color={Colors.warning} />
          <Text style={styles.waitingText}>
            Waiting for a rider to accept this delivery
          </Text>
        </View>
      )}

      {/* Action row */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.expandBtn, expanded && styles.expandBtnActive]}
          onPress={onToggle}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? "Hide delivery details" : "Track delivery on map"
          }
        >
          <Ionicons
            name={expanded ? "chevron-up-circle" : "chevron-down-circle"}
            size={18}
            color={expanded ? Colors.textInverse : Colors.primary}
          />
          <Text style={[styles.expandBtnText, expanded && styles.expandBtnActive]}>
            {expanded ? "Hide details" : "Track on Map"}
          </Text>
        </TouchableOpacity>
        {!isDelivered ? (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={confirmCancel}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Cancel delivery for order ${order.id.slice(-4).toUpperCase()}`}
          >
            <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Expanded body — map + steps */}
      {expanded ? (
        <View style={styles.expanded}>
          <DeliveryMap
            shop={shopCoords}
            rider={state.riderLatLng}
            customer={customer}
            route={route}
            height={210}
          />

          {/* Live metrics below the map */}
          <View style={styles.metricsRow}>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>Rider Location</Text>
              <Text style={styles.metricValue} numberOfLines={1}>
                {state.riderLatLng
                  ? `${state.riderLatLng.lat.toFixed(4)}, ${state.riderLatLng.lng.toFixed(4)}`
                  : "—"}
              </Text>
            </View>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>Distance Left</Text>
              <Text style={styles.metricValue}>
                {formatDistanceKm(state.distanceRemainingM)}
              </Text>
            </View>
            <View style={styles.metricCell}>
              <Text style={styles.metricLabel}>ETA</Text>
              <Text style={styles.metricValue}>{formatEta(state.etaSeconds)}</Text>
            </View>
          </View>

          {/* Turn-by-turn */}
          <View style={styles.tbtBox}>
            <View style={styles.tbtHeader}>
              <Ionicons name="navigate" size={16} color={Colors.primary} />
              <Text style={styles.tbtTitle}>Turn-by-turn directions</Text>
            </View>
            {(route?.steps ?? []).map((s, i) => (
              <View key={i} style={styles.tbtStep}>
                <View style={styles.tbtBullet}>
                  <Text style={styles.tbtBulletText}>{i + 1}</Text>
                </View>
                <Text style={styles.tbtText}>{s.instruction}</Text>
              </View>
            ))}
          </View>

          {/* Timeline */}
          <View style={styles.timelineBox}>
            <Text style={styles.timelineBoxTitle}>Delivery Progress</Text>
            <StatusTimeline status={state.status} />
          </View>

          {isDelivered ? (
            <View style={styles.deliveredBox}>
              <Ionicons name="checkmark-done-circle" size={20} color={Colors.success} />
              <Text style={styles.deliveredText}>Order successfully delivered</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Main screen                                                                */
/* -------------------------------------------------------------------------- */

export default function SellerDelivery() {
  const { session, orders, refresh } = useStore();
  const user = session?.user;
  const shopCoords = useSellerLocation();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Active deliveries = orders in `in_transit` / `picked_up` for the
  // signed-in seller, sourced entirely from the live store.
  const deliveries: ActiveDelivery[] = useMemo(() => {
    if (!user) return [];
    const sid = String(user.id);
    const inFlight = orders
      .filter(
        (o) =>
          String(o.sellerId) === sid &&
          (o.status === "in_transit" ||
            o.status === "picked_up" ||
            (o.status === "accepted" && !!o.riderId)),
      )
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return inFlight.map((order) => {
      const customer =
        toLatLng(order.deliveryLocation) ?? {
          lat: shopCoords.lat + 0.02,
          lng: shopCoords.lng + 0.02,
        };
      return {
        order,
        customer,
        gasType: order.items[0]?.productName ?? "LPG Refill",
        cylinderSize: order.items[0]?.size ?? "13kg",
        quantity: order.items[0]?.quantity ?? 1,
      };
    });
  }, [orders, user, shopCoords.lat, shopCoords.lng]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  // Auto-refresh on focus so newly-accepted in-transit orders (a rider picked
  // up from their app) appear the instant the seller returns to this tab.
  // Mirrors dashboard.tsx's pattern.
  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {
        /* silent — manual pull-to-refresh remains available */
      });
    }, [refresh]),
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <SellerHeader title="Delivery Tracking" />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Section title */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Deliveries</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        {deliveries.length === 0 ? (
          <EmptyState
            icon="📦"
            title="No active deliveries"
            message="When a customer order is accepted and a rider is on the way, it will appear here."
          />
        ) : (
          deliveries.map((d) => (
            <DeliveryCard
              key={d.order.id}
              delivery={d}
              expanded={expandedId === d.order.id}
              onToggle={() =>
                setExpandedId((cur) => (cur === d.order.id ? null : d.order.id))
              }
              sessionToken={session?.token ?? null}
            />
          ))
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* -------------------------------------------------------------------------- */
/* Status → UI helpers                                                        */
/* -------------------------------------------------------------------------- */

function statusLabel(s: DeliveryStatus): string {
  const t = TIMELINE_STEPS.find((x) => x.key === s);
  return t?.label ?? "Waiting for Rider";
}

function statusTone(
  s: DeliveryStatus,
): "primary" | "warning" | "danger" | "info" | "success" | "muted" {
  switch (s) {
    case "waiting_for_rider":
      return "warning";
    case "rider_assigned":
    case "rider_arrived_shop":
    case "picked_up":
    case "on_the_way":
      return "info";
    case "arrived_customer":
      return "primary";
    case "delivered":
      return "success";
    default:
      return "muted";
  }
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  // Section
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dangerSoft,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.danger,
  },
  liveText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.danger,
    letterSpacing: 1,
  },

  // Card
  card: { marginBottom: Spacing.lg, padding: Spacing.lg },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  orderNumber: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  customerName: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  metaText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
  },

  // Quick stats
  quickStats: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
    marginTop: 2,
  },

  // Rider block
  riderBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.accentSoft,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  riderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  riderName: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  riderPhone: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
    marginTop: 2,
  },
  riderRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  riderRatingText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.text,
  },
  riderVehicle: {
    fontSize: FontSize.xs - 1,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Waiting block
  waitingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.warningSoft,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  waitingText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.warningText,
  },

  // Actions
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  expandBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  expandBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  expandBtnText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.primary,
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.dangerSoft,
    backgroundColor: Colors.dangerSoft,
  },
  cancelBtnText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.danger,
  },

  // Expanded
  expanded: {
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  metricsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  metricCell: {
    flex: 1,
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  metricLabel: {
    fontSize: FontSize.xs - 1,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 2,
  },

  // Turn-by-turn
  tbtBox: {
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  tbtHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
  },
  tbtTitle: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  tbtStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  tbtBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  tbtBulletText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.textInverse,
  },
  tbtText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "600",
    paddingTop: 2,
  },

  // Timeline
  timelineBox: {
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  timelineBoxTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  timeline: { paddingVertical: Spacing.xs },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  timelineDotCol: {
    alignItems: "center",
    width: 30,
  },
  timelineDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotCurrent: {
    boxShadow: `0 0 0 4px ${Colors.primarySoft}`,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    minHeight: 22,
    marginTop: 2,
  },
  timelineLabel: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    fontWeight: "700",
  },
  timelineHint: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    marginTop: 2,
  },

  // Delivered
  deliveredBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.successSoft,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  deliveredText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.successText,
  },
});
