/**
 * src/hooks/useRiderTracking.ts
 *
 * Owns the Seller-side "Track Rider" live-tracking state.
 *
 * Responsibilities:
 *   • Find the signed-in seller's currently in-flight customer order
 *     (status `picked_up` / `in_transit`, with a `riderId`).
 *   • Reuse the existing `useDeliveryTracking` lifecycle so the rider
 *     simulator, status timeline, distance/ETA, and route polyline
 *     behave identically to the existing Delivery Tracking screen.
 *   • Synthesize a `Route` from the shop to the customer when the
 *     order lacks `lat`/`lng` (the seed orders use address-only —
 *     we offset ~2 km from the shop so the map still has geometry).
 *   • Fire seller-only fire-and-forget local notifications when the
 *     rider crosses three key transitions:
 *
 *         picked_up         → "Rider picked up your order"
 *         arrived_customer  → "Rider is near the customer"
 *         delivered         → "Order delivered"
 *
 *   • Maintain an in-memory event log (most recent first) so the UI
 *     can render the timeline.
 *
 * Like `useSupplierTracking`, this is **GPS-ready**: the only swap
 * needed to flip the simulated rider position into real GPS is a
 * single change in `useDeliveryTracking`. We deliberately don't touch
 * that hook.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import {
  DeliveryStatus,
  useDeliveryTracking,
} from "./useDeliveryTracking";
import { useSellerLocation } from "./useSellerLocation";
import { useStore } from "../store/StoreContext";
import {
  LatLng,
  Route,
  computeRoute,
  formatDistanceKm,
  formatEta,
} from "../lib/location";
import { Order } from "../../constants/types";
import { scheduleLocalNotification } from "../lib/notifications";
import { useOrderTracking, type OrderTrackingState } from "./useOrderTracking";

/** Seller-facing rider status vocabulary (matches the brief). */
export type RiderStatus =
  | "rider_assigned"
  | "picked_up"
  | "on_the_way"
  | "near_customer"
  | "delivered";

export interface RiderTrackingState {
  /** `null` when no rider is currently in flight for this seller. */
  order: Order | null;
  riderName: string | null;
  riderPhone: string | null;
  customerName: string | null;
  customerAddress: string | null;
  customerLatLng: LatLng | null;
  shopLatLng: LatLng;
  riderLatLng: LatLng;
  route: Route | null;
  /** Distance still to travel, in meters. */
  distanceM: number;
  /** ETA in seconds. */
  etaSeconds: number;
  status: RiderStatus;
  /** [0..1] progress along the route. */
  progress: number;
  /** Recent transitions (most recent first), capped at 8. */
  events: { at: number; status: RiderStatus; message: string }[];
  /** True while the delivery is still moving. */
  active: boolean;
  /** Live tracking state from the backend — exposes the socket status. */
  live: OrderTrackingState;
}

/** Status timeline steps used by the seller-facing rider UI. */
export const RIDER_STEPS: {
  key: RiderStatus;
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "rider_assigned", label: "Rider Assigned", color: "#3B82F6", icon: "person-circle-outline" },
  { key: "picked_up", label: "Picked Up", color: "#0EA5E9", icon: "cube-outline" },
  { key: "on_the_way", label: "On the Way", color: "#14B8A6", icon: "navigate-outline" },
  { key: "near_customer", label: "Near Customer", color: "#F97316", icon: "location-outline" },
  { key: "delivered", label: "Delivered", color: "#10B981", icon: "checkmark-done-outline" },
];

/**
 * Map `useDeliveryTracking`'s status to the seller-facing vocabulary.
 * The supplier-facing names are different ("Arrived at Customer" vs
 * "Near Customer"); we rename them here so the brief's wording is
 * preserved verbatim.
 */
function deriveStatus(s: DeliveryStatus): RiderStatus {
  switch (s) {
    case "waiting_for_rider":
      return "rider_assigned";
    case "rider_assigned":
    case "rider_arrived_shop":
      return "rider_assigned";
    case "picked_up":
      return "picked_up";
    case "on_the_way":
      return "on_the_way";
    case "arrived_customer":
      return "near_customer";
    case "delivered":
      return "delivered";
    default:
      return "rider_assigned";
  }
}

const EVENT_TEMPLATES: Record<RiderStatus, string> = {
  rider_assigned: "Rider accepted the order.",
  picked_up: "Rider picked up your order.",
  on_the_way: "Rider is on the way to the customer.",
  near_customer: "Rider is near the customer.",
  delivered: "Order delivered.",
};

/**
 * Find the most recent in-flight order for the signed-in seller
 * with a rider assigned. `picked_up` / `in_transit` only — delivered
 * orders are excluded so we don't keep tracking historical runs.
 */
function findActiveOrder(orders: Order[], sellerId: string | undefined): Order | null {
  if (!sellerId) return null;
  const inFlight = orders
    .filter(
      (o) =>
        o.sellerId === sellerId &&
        (o.status === "in_transit" || o.status === "picked_up") &&
        !!o.riderId,
    )
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return inFlight[0] ?? null;
}

/**
 * Synthesize a `LatLng` for the customer's destination when the order
 * only carries an address (the seed data is address-only). We offset
 * ~2 km north-east of the shop so the polyline has something to
 * draw. Mirrors the fallback used by `app/seller/delivery.tsx`.
 */
function customerLatLng(order: Order, shop: LatLng): LatLng {
  const lat = order.deliveryLocation?.lat;
  const lng = order.deliveryLocation?.lng;
  if (typeof lat === "number" && typeof lng === "number") {
    return { lat, lng };
  }
  return { lat: shop.lat + 0.018, lng: shop.lng + 0.018 };
}

export function useRiderTracking(): RiderTrackingState {
  const { session, orders, riders } = useStore();
  const shopLatLng = useSellerLocation();
  const order = useMemo(() => findActiveOrder(orders, session?.user.id), [
    orders,
    session?.user.id,
  ]);
  const customer = useMemo<LatLng | null>(
    () => (order ? customerLatLng(order, shopLatLng) : null),
    [order, shopLatLng],
  );
  const route: Route | null = useMemo(() => {
    if (!order || !customer) return null;
    return computeRoute(shopLatLng, customer);
  }, [order, customer, shopLatLng]);

  // Real-time rider position (from /ws/tracking). When the rider app
  // is sending live GPS, this overrides the simulator below; while
  // the rider is offline or hasn't started yet, the simulator keeps
  // advancing so the seller UI isn't blank.
  const live = useOrderTracking({
    orderId: order?.id,
    token: session?.token ?? null,
  });

  // Reuse the existing simulator. We only invoke it when there's a
  // real order + customer + route, so it advances through the
  // rider lifecycle automatically.
  const tracking = useDeliveryTracking({
    order: {
      orderId: order?.id ?? "mock",
      orderNumber: order ? order.id.slice(-4).toUpperCase() : "DEMO",
      sellerId: order?.sellerId ?? "",
      sellerName: order?.sellerName ?? "Seller",
      shopLocation: "My Shop",
      shopLatLng,
      customerName: order?.customerName ?? "Customer",
      customerLocation: order?.deliveryLocation?.address ?? "Customer address",
      customerLatLng: customer ?? shopLatLng,
      gasType: order?.items[0]?.productName ?? "LPG Refill",
      cylinderSize: order?.items[0]?.size ?? "13kg",
      quantity: order?.items[0]?.quantity ?? 1,
      radiusMeters: 8000,
    },
    route,
  });

  const rider = useMemo(() => {
    if (!order?.riderId) return null;
    return riders.find((r) => r.id === order.riderId) ?? null;
  }, [order, riders]);

  // Map state + logs.
  const status: RiderStatus = deriveStatus(tracking.state.status);
  // Prefer the live (real) rider position when we have one. The
  // simulator is only used as a fallback so the UI never blanks out
  // for a rider who's still on the dispatch queue.
  const liveRiderLatLng: LatLng = live.riderLatLng ?? tracking.state.riderLatLng;
  const distanceM = live.riderLatLng && customer
    ? haversineMetersLive(live.riderLatLng, customer)
    : tracking.state.distanceRemainingM;
  // ETA scales with the real distance when we have a live fix, else
  // fall back to the simulator's projected ETA.
  const etaSeconds = live.riderLatLng && customer
    ? Math.round(distanceM / 8.3) // ~30 km/h urban scooter
    : tracking.state.etaSeconds;

  // Local fire-and-forget notifications on key transitions. We only
  // want one push per status, so we track the last-notified status.
  const lastNotifiedRef = useRef<RiderStatus | null>(null);
  useEffect(() => {
    if (!order) return;
    if (lastNotifiedRef.current === null) {
      lastNotifiedRef.current = status;
      return;
    }
    if (lastNotifiedRef.current === status) return;
    const prev = lastNotifiedRef.current;
    lastNotifiedRef.current = status;

    if (status === "picked_up" && prev !== "picked_up") {
      scheduleLocalNotification({
        title: "Rider picked up your order",
        body: `${rider?.fullName ?? order.riderName ?? "Rider"} picked up ${order.customerName}'s order and is heading out.`,
        data: { orderId: order.id, kind: "rider_picked_up" },
      });
    } else if (status === "near_customer" && prev !== "near_customer") {
      scheduleLocalNotification({
        title: "Rider is near the customer",
        body: `${rider?.fullName ?? order.riderName ?? "Rider"} is approaching ${order.customerName}.`,
        data: { orderId: order.id, kind: "rider_near_customer" },
      });
    } else if (status === "delivered" && prev !== "delivered") {
      scheduleLocalNotification({
        title: "Order delivered",
        body: `${order.customerName}'s order was delivered successfully.`,
        data: { orderId: order.id, kind: "rider_delivered" },
      });
    }
  }, [status, order, rider]);

  // Event log for the UI timeline.
  const [events, setEvents] = useState<RiderTrackingState["events"]>([]);
  const lastLoggedRef = useRef<RiderStatus | null>(null);
  useEffect(() => {
    if (!order) return;
    if (lastLoggedRef.current === null) {
      lastLoggedRef.current = status;
      return;
    }
    if (lastLoggedRef.current === status) return;
    lastLoggedRef.current = status;
    setEvents((prev) =>
      [{ at: Date.now(), status, message: EVENT_TEMPLATES[status] }, ...prev].slice(0, 8),
    );
  }, [status, order]);

  // Reset on order switch.
  useEffect(() => {
    lastNotifiedRef.current = null;
    lastLoggedRef.current = null;
    setEvents([]);
  }, [order?.id]);

  return {
    order: order ?? null,
    riderName: rider?.fullName ?? order?.riderName ?? null,
    riderPhone: rider?.phone ?? null,
    customerName: order?.customerName ?? null,
    customerAddress: order?.deliveryLocation?.address ?? null,
    customerLatLng: customer,
    shopLatLng,
    riderLatLng: liveRiderLatLng,
    route,
    distanceM,
    etaSeconds,
    status,
    progress: tracking.state.progress,
    events,
    active: tracking.state.status !== "delivered",
    live,
  };
}

// Inline haversine — keeps this hook self-contained without dragging
// the location util's named export into the public surface.
function haversineMetersLive(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* -------------------------------------------------------------------------- */
/* UI helpers                                                                 */
/* -------------------------------------------------------------------------- */

export function riderStatusLabel(s: RiderStatus): string {
  return RIDER_STEPS.find((x) => x.key === s)?.label ?? "Rider Assigned";
}

export function riderStatusColor(s: RiderStatus): string {
  return RIDER_STEPS.find((x) => x.key === s)?.color ?? Colors.textSecondary;
}

export function riderStepIndex(s: RiderStatus): number {
  return RIDER_STEPS.findIndex((x) => x.key === s);
}

export function formatRiderDistance(meters: number): string {
  return formatDistanceKm(meters);
}

export function formatRiderEta(seconds: number): string {
  return formatEta(seconds);
}
