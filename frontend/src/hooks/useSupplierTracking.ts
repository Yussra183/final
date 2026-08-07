/**
 * src/hooks/useSupplierTracking.ts
 *
 * Owns the Seller-side "Track Supplier" live-tracking state.
 *
 * Responsibilities:
 *   • Look up the active `DeliveryTrip` that includes a stop owned
 *     by the signed-in seller.
 *   • Drive the supplier vehicle along the route polyline by feeding
 *     the trip id to the existing `useTripTicker` (so we never
 *     duplicate state with the supplier view).
 *   • Project the vehicle's current position via `pointAtProgress`.
 *   • Surface a derived "supplier status" for the seller that maps
 *     to the brief's vocabulary:
 *
 *        scheduled   → trip hasn't started yet
 *        started     → trip started, supplier is heading out
 *        on_the_way  → supplier is en route to this seller
 *        near_shop   → supplier within NEAR_RADIUS_METERS of seller
 *        delivered   → supplier delivered (or whole trip completed)
 *
 *   • Compute live distance + ETA to the seller's stop.
 *   • Maintain a small in-memory event log so the screen can render
 *     the timeline of transitions. Notifications are already fired
 *     by the store (`startTrip` / `tickTrip` / `markStopDelivered`
 *     call `fanOutLocalNotifications`), so we don't emit new ones.
 *
 * Trips and routes live on the backend today (`refresh()` populates
 * `trips` / `routes`); this hook simply wires the supplier's active
 * trip into the trip-ticker + map. Swapping in real GPS only
 * requires wiring `Location.watchPositionAsync` into the same
 * return shape.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { useStore } from "../store/StoreContext";
import { useTripTicker } from "./useTripTicker";
import {
  LatLng,
  formatDistanceKm,
  formatEta,
  haversineMeters,
  pointAtProgress,
} from "../lib/location";
import {
  DeliveryTrip,
  DeliveryRoute,
  RouteStop,
  StopStatus,
} from "../../constants/types";

/** Seller-facing supplier status vocabulary (matches the brief). */
export type SupplierStatus =
  | "scheduled"
  | "started"
  | "on_the_way"
  | "near_shop"
  | "delivered";

export interface SupplierTrackingState {
  /** `null` if there's no trip for this seller right now. */
  trip: DeliveryTrip | null;
  route: DeliveryRoute | null;
  /** The specific stop owned by the signed-in seller. */
  myStop: RouteStop | null;
  /** Live position of the supplier's vehicle. */
  vehiclePos: LatLng;
  /** Distance still to travel to the seller's stop, in meters. */
  distanceM: number;
  /** ETA in seconds to the seller's stop. */
  etaSeconds: number;
  /** Seller-facing status derived from stop + trip state. */
  status: SupplierStatus;
  /** [0..1] progress along the polyline. */
  progress: number;
  /** Ordered polyline drawn under the moving pin. */
  routePolyline: LatLng[];
  /** Recent transitions (most recent first), cap 8. */
  events: { at: number; status: SupplierStatus; message: string }[];
  /** True while the trip is still in motion. */
  active: boolean;
}

/** Status timeline steps used by the seller-facing map UI. */
export const SUPPLIER_STEPS: {
  key: SupplierStatus;
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "scheduled", label: "Scheduled", color: "#94A3B8", icon: "calendar-outline" },
  { key: "started", label: "Started", color: "#3B82F6", icon: "play-circle-outline" },
  { key: "on_the_way", label: "On the Way", color: "#0EA5E9", icon: "navigate-outline" },
  { key: "near_shop", label: "Near Your Shop", color: "#F97316", icon: "location-outline" },
  { key: "delivered", label: "Delivered", color: "#10B981", icon: "checkmark-done-outline" },
];


/** A small `~30 km/h` average that mirrors the supplier ETA helper. */
const URBAN_SPEED_M_PER_S = 30000 / 3600;

/**
 * Find the trip that targets the signed-in seller. Prefers in-flight
 * trips; falls back to any trip that hasn't been fully delivered yet.
 */
function findActiveTrip(
  trips: DeliveryTrip[],
  sellerId: string | undefined,
): { trip: DeliveryTrip; stop: RouteStop } | null {
  if (!sellerId) return null;
  const candidates: { trip: DeliveryTrip; stop: RouteStop; priority: number }[] = [];
  for (const t of trips) {
    const stop = t.stops.find((s) => s.sellerId === sellerId);
    if (!stop) continue;
    if (t.status === "completed" && stop.status === "delivered") {
      candidates.push({ trip: t, stop, priority: 3 });
    } else if (t.status === "in_transit" || t.status === "started") {
      candidates.push({ trip: t, stop, priority: 0 });
    } else if (t.status === "draft") {
      candidates.push({ trip: t, stop, priority: 2 });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.priority - b.priority);
  return { trip: candidates[0].trip, stop: candidates[0].stop };
}

/**
 * Map the raw (stop.status, trip.status, distance) tuple to the
 * seller-facing vocabulary.
 */
function deriveStatus(
  stopStatus: StopStatus,
  tripStatus: DeliveryTrip["status"],
  distanceMeters: number,
): SupplierStatus {
  if (stopStatus === "delivered" || tripStatus === "completed") return "delivered";
  if (stopStatus === "near_shop" || distanceMeters <= 500) return "near_shop";
  if (stopStatus === "on_the_way") return "on_the_way";
  if (stopStatus === "started" || tripStatus === "in_transit" || tripStatus === "started") {
    return "started";
  }
  return "scheduled";
}

const EVENT_TEMPLATES: Record<SupplierStatus, string> = {
  scheduled: "Trip scheduled.",
  started: "Supplier started delivery.",
  on_the_way: "Supplier is on the way to your shop.",
  near_shop: "Supplier is near your shop (within 500 m).",
  delivered: "Delivery completed.",
};

export function useSupplierTracking(): SupplierTrackingState {
  const { session, trips, routes } = useStore();
  const sellerId = session?.user.id;

  // Memoize lookup — trips/routes change as the store updates.
  const found = useMemo(() => findActiveTrip(trips, sellerId), [trips, sellerId]);
  const trip = found?.trip ?? null;
  const myStop = found?.stop ?? null;
  const route = trip ? routes.find((r) => r.id === trip.routeId) ?? null : null;
  const polyline: LatLng[] = useMemo(() => route?.polyline ?? [], [route]);

  // Drive progress via the existing trip ticker (no duplicate state).
  useTripTicker(trip?.id);

  // Compute derived state on every render.
  const vehiclePos: LatLng = useMemo(() => {
    if (!trip) return { lat: -1.2864, lng: 36.8172 };
    if (polyline.length > 0) {
      return pointAtProgress({ polyline } as any, trip.progress);
    }
    if (myStop) return { lat: myStop.lat, lng: myStop.lng };
    return { lat: -1.2864, lng: 36.8172 };
  }, [trip, polyline, myStop]);

  const distanceM = useMemo(() => {
    if (!myStop) return 0;
    return haversineMeters(vehiclePos, { lat: myStop.lat, lng: myStop.lng });
  }, [vehiclePos, myStop]);

  const etaSeconds = Math.round(distanceM / URBAN_SPEED_M_PER_S);
  const status: SupplierStatus = myStop && trip
    ? deriveStatus(myStop.status, trip.status, distanceM)
    : "scheduled";

  // Maintain a rolling event log so the UI can show the recent
  // transitions. We dedup adjacent entries by status.
  const [events, setEvents] = useState<SupplierTrackingState["events"]>([]);
  const lastLoggedRef = useRef<SupplierStatus | null>(null);

  useEffect(() => {
    if (!trip || !myStop) return;
    if (lastLoggedRef.current === status) return;
    if (lastLoggedRef.current === null) {
      // First observation — log the initial state without a banner.
      lastLoggedRef.current = status;
      return;
    }
    lastLoggedRef.current = status;
    setEvents((prev) => [
      { at: Date.now(), status, message: EVENT_TEMPLATES[status] },
      ...prev,
    ].slice(0, 8));
  }, [status, trip, myStop]);

  // Reset event log when switching trips/sellers.
  useEffect(() => {
    lastLoggedRef.current = null;
    setEvents([]);
  }, [trip?.id, myStop?.sellerId]);

  return {
    trip,
    route,
    myStop,
    vehiclePos,
    distanceM,
    etaSeconds,
    status,
    progress: trip?.progress ?? 0,
    routePolyline: polyline,
    events,
    active: trip ? trip.status !== "completed" : false,
  };
}

/* -------------------------------------------------------------------------- */
/* UI helpers                                                                 */
/* -------------------------------------------------------------------------- */

export function supplierStatusLabel(s: SupplierStatus): string {
  return SUPPLIER_STEPS.find((x) => x.key === s)?.label ?? "Scheduled";
}

export function supplierStatusColor(s: SupplierStatus): string {
  return SUPPLIER_STEPS.find((x) => x.key === s)?.color ?? Colors.textSecondary;
}

export function supplierStepIndex(s: SupplierStatus): number {
  return SUPPLIER_STEPS.findIndex((x) => x.key === s);
}

export function formatSupplierDistance(meters: number): string {
  return formatDistanceKm(meters);
}

export function formatSupplierEta(seconds: number): string {
  return formatEta(seconds);
}
