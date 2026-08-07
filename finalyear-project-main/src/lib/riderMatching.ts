/**
 * src/lib/riderMatching.ts
 *
 * "First-come-first-served" race between nearby available riders.
 *
 * The seller never picks a rider — the broadcast goes to every rider
 * that is `online`, `available`, and within `radiusMeters` of the
 * shop. The first rider to tap "Accept Delivery" wins; everyone else
 * has the order removed from their queue immediately.
 *
 * Real integration:
 *   • Broadcast   → FCM topic per (zone + size) + a backend websockets
 *                   channel the rider app subscribes to.
 *   • Locking     → atomic Redis SETNX (`lock:{orderId}` -> riderId).
 *   • Notification→ APNs / FCM payload mirroring `DeliveryRequest`.
 *
 * NOTE: seed/mock rider data was removed. All rider pool / seller↔rider
 * assignment lookups now come from the live Spring Boot backend via
 * the relevant resource APIs; this file only carries the pure helpers
 * (haversine sort, payload shape, broadcast radius) that are still
 * useful in the live integration path.
 */
import { LatLng, haversineMeters } from "./location";

export type RiderStatus = "online" | "offline" | "on_delivery";

export interface Rider {
  id: string;
  fullName: string;
  phone: string;
  status: RiderStatus;
  available: boolean; // true ⇒ they tap Accept when broadcast arrives
  vehicle?: string; // e.g. "Boda Boda"
  rating?: number; // 0..5
  lat: number;
  lng: number;
}

/** Payload broadcast to every nearby rider's queue. */
export interface DeliveryRequest {
  orderId: string;
  orderNumber: string;
  sellerName: string;
  shopLocation: string;
  shopLatLng: LatLng;
  customerName: string;
  customerLocation: string;
  customerLatLng: LatLng;
  gasType: string;
  cylinderSize: string;
  quantity: number;
  /** Distance from rider → shop, used to sort the queue. */
  estimatedDistanceKm: number;
}

/** Default radius used when the shop doesn't ship its own. */
export const DEFAULT_BROADCAST_RADIUS_M = 5_000;
