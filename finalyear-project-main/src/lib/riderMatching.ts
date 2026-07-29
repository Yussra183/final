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

const seededRiders: Rider[] = [
  {
    id: "11",
    fullName: "Hassan Rider",
    phone: "+255700000004",
    status: "online",
    available: true,
    vehicle: "Honda CG125",
    rating: 4.7,
    lat: -6.8235,
    lng: 39.2695,
  },
  {
    id: "13",
    fullName: "Daniel Mwangi",
    phone: "+254712345001",
    status: "online",
    available: true,
    vehicle: "Boda Boda",
    rating: 4.8,
    lat: -1.2864,
    lng: 36.8172,
  },
  {
    id: "14",
    fullName: "Brian Otieno",
    phone: "+254712345002",
    status: "online",
    available: true,
    vehicle: "Boda Boda",
    rating: 4.6,
    lat: -1.2921,
    lng: 36.8219,
  },
  {
    id: "15",
    fullName: "Esther Wanjiku",
    phone: "+254712345003",
    status: "online",
    available: true,
    vehicle: "Pickup Truck",
    rating: 4.9,
    lat: -1.3002,
    lng: 36.8264,
  },
  {
    id: "16",
    fullName: "Kelvin Mutiso",
    phone: "+254712345004",
    status: "offline",
    available: false,
    vehicle: "Motorbike",
    rating: 4.4,
    lat: -1.311,
    lng: 36.835,
  },
];

/**
 * Seller↔rider assignment, mirroring the backend's `seller_riders` join
 * table seeded in V3 (see
 * gas-delivery/.../V3__seed_users_products_riders.sql). Keys are seller
 * ids (string-numerics to match `OrderEntity.sellerId`), values are the
 * `Rider.id`s assigned to that seller.
 */
export const seededSellerRiders: Record<string, string[]> = {
  "2":  ["11", "13", "14"],
  "3":  ["11", "13"],
  "4":  ["14", "15"],
  "5":  ["11", "15"],
  "6":  ["16"],
  "7":  ["16"],
  "8":  ["13", "14"],
  "9":  ["15"],
};

/**
 * Async-mock of the global rider pool. Returns the full seeded list.
 *
 * Kept for back-compat with any code path that genuinely needs every
 * rider (e.g. the admin assignments screen). Broadcast / dispatch code
 * MUST prefer {@link fetchOnlineRidersForSeller} so the seller-scoping
 * rule is honored end-to-end (mirrors the backend's `seller_riders`).
 */
export async function fetchOnlineRiders(): Promise<Rider[]> {
  return Promise.resolve(seededRiders);
}

/**
 * Fetch only the riders assigned to a particular seller. Returns `[]`
 * for sellers with no assignment — the right answer (vs leaking every
 * rider when the seller has nobody on call).
 */
export async function fetchOnlineRidersForSeller(
  sellerId: string,
): Promise<Rider[]> {
  const allowedIds = new Set(seededSellerRiders[sellerId] ?? []);
  if (allowedIds.size === 0) return [];
  return seededRiders.filter((r) => allowedIds.has(r.id));
}

/**
 * Inverse helper: which sellers is this rider assigned to?
 * Used by the rider app and the in-memory dispatch filter.
 */
export function sellersForRider(riderId: string): string[] {
  const out: string[] = [];
  for (const [seller, riders] of Object.entries(seededSellerRiders)) {
    if (riders.includes(riderId)) out.push(seller);
  }
  return out;
}

/**
 * Build the broadcast payload for a single rider.
 *
 * Returns `null` if the rider is too far away — the caller filters
 * such riders before they ever see the Accept button.
 */
export function buildDeliveryRequest(
  order: DeliveryRequestOrder,
  rider: Rider,
): DeliveryRequest | null {
  const meterDistance = haversineMeters(
    { lat: rider.lat, lng: rider.lng },
    order.shopLatLng,
  );
  const radius = order.radiusMeters ?? DEFAULT_BROADCAST_RADIUS_M;
  if (meterDistance > radius) return null;
  return {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    sellerName: order.sellerName,
    shopLocation: order.shopLocation,
    shopLatLng: order.shopLatLng,
    customerName: order.customerName,
    customerLocation: order.customerLocation,
    customerLatLng: order.customerLatLng,
    gasType: order.gasType,
    cylinderSize: order.cylinderSize,
    quantity: order.quantity,
    estimatedDistanceKm: meterDistance / 1000,
  };
}

export interface DeliveryRequestOrder {
  orderId: string;
  orderNumber: string;
  /** String-numeric id of the seller, e.g. "2" or "u-sell-2". Used by the
   * broadcast path to scope to that seller's rider team — mirrors the
   * backend's `seller_riders` rule. */
  sellerId: string;
  sellerName: string;
  shopLocation: string;
  shopLatLng: LatLng;
  customerName: string;
  customerLocation: string;
  customerLatLng: LatLng;
  gasType: string;
  cylinderSize: string;
  quantity: number;
  radiusMeters?: number;
}

/**
 * Pick the "winning" rider for a moment in time.
 *
 * Race model:
 *   1. Filter riders: online + available + within radius.
 *   2. Sort by current bid timestamp (asc). The first to call
 *      `acceptDelivery(orderId)` writes the lock.
 *   3. `acceptDelivery()` returns that rider — anyone calling after
 *      gets `null` and the order disappears from their screen.
 *
 * This is in-memory because there is no backend yet. The contract is
 * shaped so the only function that needs to change is the body of
 * `acceptDelivery` (it becomes an API call); the UI never knows.
 */
const locks = new Map<string, string>(); // orderId → riderId
const acceptTimestamps = new Map<string, number>(); // orderId → epoch ms

export function listEligibleRiders(
  order: DeliveryRequestOrder,
  riders: Rider[],
): Rider[] {
  const radius = order.radiusMeters ?? DEFAULT_BROADCAST_RADIUS_M;
  return riders
    .filter(
      (r) =>
        r.status === "online" &&
        r.available &&
        haversineMeters({ lat: r.lat, lng: r.lng }, order.shopLatLng) <= radius,
    )
    .sort(
      (a, b) =>
        haversineMeters({ lat: a.lat, lng: a.lng }, order.shopLatLng) -
        haversineMeters({ lat: b.lat, lng: b.lng }, order.shopLatLng),
    );
}

/**
 * First rider wins — atomic from the caller's perspective. Subsequent
 * callers always see `null` until the lock is cleared (cancel / order
 * fails).
 */
export function acceptDelivery(orderId: string, riderId: string): boolean {
  const existing = locks.get(orderId);
  if (existing && existing !== riderId) return false;
  if (!existing) {
    locks.set(orderId, riderId);
    acceptTimestamps.set(orderId, Date.now());
  }
  return true;
}

export function releaseDelivery(orderId: string) {
  locks.delete(orderId);
  acceptTimestamps.delete(orderId);
}

export function getAssignedRiderId(orderId: string): string | undefined {
  return locks.get(orderId);
}

/** Used by the simulated "race" UI to animate competing riders. */
export function getAcceptTimestamp(orderId: string): number | undefined {
  return acceptTimestamps.get(orderId);
}
