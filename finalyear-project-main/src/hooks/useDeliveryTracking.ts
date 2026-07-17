/**
 * src/hooks/useDeliveryTracking.ts
 *
 * Single source of truth for the seller's delivery screen. Owns:
 *
 *   • the lifecycle of the broadcast → first-accept lock
 *   • the rider status timeline (Waiting → … → Delivered)
 *   • the rider's simulated progress along the route polyline
 *
 * Today this is driven by `setInterval`; production wiring swaps each
 * tick for a websocket / Firestore listener without changing the
 * public hook API.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LatLng, Route, pointAtProgress } from "../lib/location";
import {
  DeliveryRequestOrder,
  Rider,
  acceptDelivery,
  fetchOnlineRiders,
  getAssignedRiderId,
  listEligibleRiders,
  releaseDelivery,
} from "../lib/riderMatching";

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
  /** Riders the broadcast was sent to, sorted by distance. */
  competingRiders: Rider[];
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

interface UseDeliveryTrackingArgs {
  order: DeliveryRequestOrder;
  /** Live route to the customer, computed once rider is assigned. */
  route: Route | null;
  /** Tick interval in ms. Defaults to 2000. Set to 0 to pause sim. */
  tickIntervalMs?: number;
}

/**
 * Owns the simulated race + post-assignment rider progress.
 *
 *   1. On mount, fetch the online rider pool and broadcast.
 *   2. After ~5s, auto-assign the closest rider (the simulated first
 *      tap). In a real system this fires from the rider app.
 *   3. Once assigned, advance the rider along the route polyline
 *      and step through the status timeline automatically.
 */
export function useDeliveryTracking({
  order,
  route,
  tickIntervalMs = 2000,
}: UseDeliveryTrackingArgs) {
  const [state, setState] = useState<DeliveryTrackingState>({
    status: "waiting_for_rider",
    route,
    rider: null,
    riderLatLng: order.shopLatLng,
    progress: 0,
    distanceRemainingM: route?.distanceMeters ?? 0,
    etaSeconds: route?.durationSeconds ?? 0,
    competingRiders: [],
    tick: 0,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // 1. Broadcast to all eligible riders on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pool = await fetchOnlineRiders();
      if (cancelled) return;
      const eligible = listEligibleRiders(order, pool);
      setState((s) => ({ ...s, competingRiders: eligible }));
    })();
    return () => {
      cancelled = true;
    };
  }, [order]);

  // 2. Simulate "first rider wins" race after ~5s.
  useEffect(() => {
    if (state.status !== "waiting_for_rider") return;
    if (state.competingRiders.length === 0) return;

    const t = setTimeout(() => {
      const winner = state.competingRiders[0];
      const ok = acceptDelivery(order.orderId, winner.id);
      if (!ok) return;
      setState((s) => ({
        ...s,
        status: "rider_assigned",
        rider: {
          id: winner.id,
          fullName: winner.fullName,
          phone: winner.phone,
          vehicle: winner.vehicle,
          rating: winner.rating,
          acceptedAt: Date.now(),
        },
        riderLatLng: { lat: winner.lat, lng: winner.lng },
        competingRiders: s.competingRiders.filter((r) => r.id !== winner.id),
        tick: s.tick + 1,
      }));
    }, 5000);

    return () => clearTimeout(t);
  }, [state.status, state.competingRiders, order.orderId]);

  // 3. Step status forward once a rider exists and we have a route.
  useEffect(() => {
    if (!state.rider || !state.route) return;
    if (state.status === "delivered") return;

    const t = setTimeout(() => {
      setState((s) => {
        const next = advanceStatus(s.status);
        if (!next || next === s.status) return { ...s, tick: s.tick + 1 };
        return { ...s, status: next, tick: s.tick + 1 };
      });
    }, 4000);
    return () => clearTimeout(t);
  }, [state.rider, state.route, state.status, state.tick]);

  // 4. Tick the rider forward along the route.
  useEffect(() => {
    if (!state.route) return;
    if (!isMovingStatus(state.status)) return;

    const interval = setInterval(() => {
      setState((s) => {
        if (!s.route) return { ...s, tick: s.tick + 1 };
        const stepInc = tickIntervalMs <= 0 ? 0 : 1 / (s.route.durationSeconds * 1000 / tickIntervalMs);
        const nextProgress = Math.min(1, s.progress + stepInc);
        if (nextProgress >= 1 && s.status !== "delivered") {
          return {
            ...s,
            progress: 1,
            riderLatLng: pointAtProgress(s.route, 1),
            distanceRemainingM: 0,
            etaSeconds: 0,
            status: "delivered",
            tick: s.tick + 1,
          };
        }
        const point = pointAtProgress(s.route, nextProgress);
        const remaining = (1 - nextProgress) * s.route.distanceMeters;
        const remainingEta = (1 - nextProgress) * s.route.durationSeconds;
        return {
          ...s,
          progress: nextProgress,
          riderLatLng: point,
          distanceRemainingM: remaining,
          etaSeconds: remainingEta,
          tick: s.tick + 1,
        };
      });
    }, tickIntervalMs);

    return () => clearInterval(interval);
  }, [state.route, state.status, tickIntervalMs]);

  const cancel = useCallback(() => {
    releaseDelivery(order.orderId);
    setState((s) => ({
      ...s,
      status: "waiting_for_rider",
      rider: null,
      progress: 0,
      riderLatLng: order.shopLatLng,
      competingRiders: s.competingRiders,
      tick: s.tick + 1,
    }));
  }, [order.orderId, order.shopLatLng]);

  const debugForceAssign = useCallback(
    (riderId: string) => {
      const r = state.competingRiders.find((rr) => rr.id === riderId) ?? state.rider;
      if (!r) return;
      acceptDelivery(order.orderId, r.id);
      setState((s) => ({
        ...s,
        status: "rider_assigned",
        rider: {
          id: r.id,
          fullName: r.fullName,
          phone: r.phone,
          vehicle: r.vehicle,
          rating: r.rating,
          acceptedAt: Date.now(),
        },
        riderLatLng: { lat: r.lat, lng: r.lng },
        competingRiders: s.competingRiders.filter((rr) => rr.id !== r.id),
        tick: s.tick + 1,
      }));
    },
    [order.orderId, state.competingRiders, state.rider],
  );

  return { state, cancel, debugForceAssign };
}

function advanceStatus(s: DeliveryStatus): DeliveryStatus | null {
  const flow: Record<DeliveryStatus, DeliveryStatus> = {
    waiting_for_rider: "rider_assigned",
    rider_assigned: "rider_arrived_shop",
    rider_arrived_shop: "picked_up",
    picked_up: "on_the_way",
    on_the_way: "arrived_customer",
    arrived_customer: "delivered",
    delivered: "delivered",
  };
  return flow[s] ?? null;
}

function isMovingStatus(s: DeliveryStatus): boolean {
  return s === "rider_assigned" || s === "picked_up" || s === "on_the_way" || s === "arrived_customer";
}

export { getAssignedRiderId };
