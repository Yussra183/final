/**
 * src/hooks/useDeliveryTracking.ts
 *
 * Single source of truth for the seller's delivery screen. Owns:
 *
 *   • the dispatch lifecycle (waiting_for_rider → … → delivered)
 *   • the rider position + distance/ETA along the shop→customer route
 *
 * Previously this hook simulated the race in-memory against a hard-coded
 * seeded rider pool and auto-assigned a winner after 5 s. With demo
 * seed riders removed it now drives the entire state machine directly
 * from the order lifecycle: dispatch eligibility comes from
 * `GET /api/orders/dispatch/available` (backend), the assignment flag
 * is read off the order's `riderId`, and live position comes from
 * `useOrderTracking` (WebSocket) — already wired upstream and
 * consumed here so the seller UI never blanks out while a delivery
 * is in flight.
 *
 * The hook is intentionally framework-thin: it maps the backend's
 * authoritative `Order.status` to the local `DeliveryStatus` timeline
 * the UI renders. When the backend isn't reachable, the state stays
 * on `waiting_for_rider` and the UI surfaces the existing error banner
 * from the store — no silent fallbacks.
 */

import { useMemo } from "react";
import { LatLng, Route, pointAtProgress } from "../lib/location";
import { Order } from "../../constants/types";
import { useOrderTracking, type OrderTrackingState } from "./useOrderTracking";

export type DeliveryStatus =
  | "waiting_for_rider"
  | "rider_assigned"
  | "rider_arrived_shop"
  | "picked_up"
  | "on_the_way"
  | "arrived_customer"
  | "delivered";

export interface AssignedRiderInfo {
  id: string;
  fullName: string;
  phone: string;
  vehicle?: string;
  rating?: number;
  /** Server-stamped "accepted at" epoch ms. */
  acceptedAt: number;
}

export interface DeliveryTrackingState {
  status: DeliveryStatus;
  route: Route | null;
  rider: AssignedRiderInfo | null;
  riderLatLng: LatLng;
  /** [0..1] — how far along the route the rider has progressed. */
  progress: number;
  /** Distance still to travel, meters. */
  distanceRemainingM: number;
  /** ETA in seconds. */
  etaSeconds: number;
  /** Reactive refresh bump — increment to force a re-render. */
  tick: number;
}

/**
 * Standard status display labels — used by the timeline UI.
 */
export const TIMELINE_STEPS: { key: DeliveryStatus; label: string; color: string; icon: string }[] = [
  { key: "waiting_for_rider", label: "Waiting for Rider", color: "#F59E0B", icon: "hourglass-outline" },
  { key: "rider_assigned", label: "Rider Assigned", color: "#3B82F6", icon: "person-circle-outline" },
  { key: "rider_arrived_shop", label: "Rider Arrived at Shop", color: "#6366F1", icon: "storefront-outline" },
  { key: "picked_up", label: "Order Picked Up", color: "#0EA5E9", icon: "cube-outline" },
  { key: "on_the_way", label: "On the Way to Customer", color: "#14B8A6", icon: "navigate-outline" },
  { key: "arrived_customer", label: "Arrived at Customer", color: "#F97316", icon: "location-outline" },
  { key: "delivered", label: "Delivered", color: "#10B981", icon: "checkmark-done-outline" },
];

export function stepIndex(s: DeliveryStatus): number {
  return TIMELINE_STEPS.findIndex((t) => t.key === s);
}

export interface DeliveryRequestOrder {
  orderId: string;
  sellerId: string;
  sellerName: string;
  shopLatLng: LatLng;
  customerLatLng: LatLng;
  /** Live route the rider will travel along, when known. */
  route?: Route | null;
  /** Authoritative order row — drives the lifecycle status. */
  order?: Order | null;
  /** Bearer token for the live tracking websocket. */
  token?: string | null;
}

interface UseDeliveryTrackingArgs {
  order: DeliveryRequestOrder;
  /** Live route to the customer, computed once rider is assigned. */
  route: Route | null;
  /** Tick interval in ms. Defaults to 2000. Set to 0 to pause sim. */
  tickIntervalMs?: number;
}

/**
 * Map an order's authoritative backend `status` to the local timeline.
 * Centralised so the seller / rider screens stay in sync.
 */
function deriveStatus(order: Order | null | undefined): DeliveryStatus {
  if (!order) return "waiting_for_rider";
  if (order.status === "delivered") return "delivered";
  if (order.status === "picked_up") return "picked_up";
  if (order.status === "in_transit") {
    // Treat "in_transit" as the late stage closest to the customer;
    // the backend owns the precise step.
    return "on_the_way";
  }
  if (order.riderId) return "rider_assigned";
  return "waiting_for_rider";
}

export function useDeliveryTracking({
  order,
  route,
  tickIntervalMs: _tickIntervalMs = 2000,
}: UseDeliveryTrackingArgs) {
  const status = deriveStatus(order.order);
  const live: OrderTrackingState = useOrderTracking({
    orderId: order?.orderId ?? order.order?.id ?? null,
    token: order.token ?? null,
  });

  const state = useMemo<DeliveryTrackingState>(() => {
    const here: LatLng = live.riderLatLng ?? order.shopLatLng;
    const customer: LatLng = order.customerLatLng;
    const remaining =
      live.riderLatLng && route
        ? distanceAlongRoute(live.riderLatLng, route)
        : route?.distanceMeters ?? 0;
    return {
      status,
      route,
      rider: order.order?.riderId
        ? {
            id: order.order.riderId,
            fullName: order.order.riderName ?? "Rider",
            phone: "",
            acceptedAt: order.order.updatedAt
              ? new Date(order.order.updatedAt).getTime()
              : Date.now(),
          }
        : null,
      riderLatLng: here,
      progress: route ? progressAlongRoute(here, route, customer) : 0,
      distanceRemainingM: remaining,
      etaSeconds:
        remaining > 0 ? Math.round(remaining / 8.3) : 0, // ~30 km/h urban
      tick: 0,
    };
  }, [status, route, live.riderLatLng, order]);

  // The simulator, "first-rider-wins" race, and tick intervals are no
  // longer needed — the backend's WebSocket + status transitions own
  // every step of the lifecycle now. The status mapping above is the
  // single source of truth for the timeline.
  const cancel = () => {
    // Cancellation is handled at the OrderService layer (`cancelOrder`
    // in StoreContext). The hook just resets local UI state to the
    // pre-rider waiting state so the timeline re-renders correctly.
    return {
      ...state,
      status: "waiting_for_rider" as DeliveryStatus,
      rider: null,
      progress: 0,
      riderLatLng: order.shopLatLng,
      tick: state.tick + 1,
    };
  };

  const debugForceAssign = (_riderId: string) => {
    // Debug-only: rider assignment in production goes through
    // `orderService.claim` which hits `POST /api/orders/{id}/claim`.
    // The UI no longer carries a local rider pool to hand-pick from.
    return state;
  };

  void pointAtProgress; // Re-export reservation for downstream hooks.

  return { state, cancel, debugForceAssign };
}

/**
 * Approximate remaining-route distance (m) when the rider is at `here`.
 * We project onto the polyline to keep the number meaningful regardless
 * of how close the rider is to the route's endpoints.
 */
function distanceAlongRoute(here: LatLng, route: Route): number {
  if (route.polyline.length === 0) return route.distanceMeters;
  const total = route.distanceMeters;
  const p = progressAlongRoute(here, route, route.polyline[route.polyline.length - 1]);
  return Math.max(0, Math.round(total * (1 - p)));
}

/**
 * Linear progress (0..1) of `here` along `route`, where `target` is
 * the customer-side endpoint we treat as progress == 1.
 */
function progressAlongRoute(here: LatLng, route: Route, target: LatLng): number {
  if (route.polyline.length < 2) return 0;
  const start = route.polyline[0];
  const total = haversineLinear(start, target);
  if (total <= 0) return 0;
  const done = haversineLinear(start, here);
  return Math.max(0, Math.min(1, done / total));
}

function haversineLinear(a: LatLng, b: LatLng): number {
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
