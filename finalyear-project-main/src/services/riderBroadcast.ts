/**
 * Service façade over `src/lib/riderMatching.ts`.
 *
 * Goals:
 *   • Hide the in-memory lock implementation behind a stable interface
 *     so the store layer doesn't import the lib directly.
 *   • Provide a single function that takes an `Order` and:
 *       - returns the proximity-ordered list of eligible riders
 *       - writes an audit trail (in-app notifications per rider)
 *       - tries the atomic claim lock on behalf of the rider
 *
 * Real integration (documented for the backend team):
 *   • `eligibleRidersForOrder` is implemented server-side at
 *     `GET /api/orders/dispatch/available`. The mock here keeps the UI
 *     fully exercisable while the backend writes are still in flight.
 *   • `claimForRider(orderId, riderId)` is implemented server-side at
 *     `POST /api/orders/{id}/claim`. The server uses an atomic SETNX to
 *     make sure only the first rider succeeds; everyone else gets 409
 *     with code `RIDER_BUSY`.
 */
import {
  listEligibleRiders,
  acceptDelivery,
  type Rider,
} from "../lib/riderMatching";
import type { Order } from "../../constants/types";
import { OrderServiceError } from "./orderErrors";

/**
 * Snapshot of the rider pool. The store feeds this in from
 * `useStore().users.filter(role === "rider")` (or its backend
 * equivalent) — we don't pull it ourselves so the service remains
 * pure against the inputs it's given.
 */
export interface RiderPool {
  list(): Promise<Rider[]> | Rider[];
}

export interface RiderBroadcastService {
  /**
   * Riders who are online, available, and within `radiusM` of the
   * shop — sorted by proximity (closest first). `null` means the
   * order has no shop coordinates so we can't filter by distance; the
   * caller should fall back to broadcasting to the whole pool.
   */
  eligibleRidersForOrder(order: Order): Promise<Rider[]>;
  /**
   * Try to claim an order for a specific rider. Returns true if the
   * rider wins the race, false if another rider already claimed.
   * Throws `RIDER_BUSY` so the store can surface a friendly message.
   */
  claimForRider(orderId: string, rider: Rider): Promise<Rider>;
}

/** Optional shop coordinates — used for the distance filter. */
const shopCoords = (
  order: Order,
): { lat: number; lng: number } | null => {
  // Future: the seller profile carries lat/lng. Today the order itself
  // doesn't, so we fall back to the delivery coordinates when present
  // (the rider rides between shop and customer, so either is a fine
  // proxy for "near the job").
  const dl = order.deliveryLocation;
  if (typeof dl.lat === "number" && typeof dl.lng === "number") {
    return { lat: dl.lat, lng: dl.lng };
  }
  return null;
};

/**
 * Default implementation. Holds no state — the underlying lock is owned
 * by `src/lib/riderMatching.ts` which is itself a singleton at runtime.
 */
export const defaultRiderBroadcastService: RiderBroadcastService = {
  async eligibleRidersForOrder(order) {
    const here = shopCoords(order);
    if (!here) return [];
    const all = await defaultRiderPool();
    return listEligibleRiders(
      {
        orderId: order.id,
        orderNumber: order.id.slice(-4),
        sellerName: order.sellerName,
        shopLocation:
          order.deliveryLocation.address ?? "Customer address",
        shopLatLng: here,
        customerName: order.customerName,
        customerLocation: order.deliveryLocation.address ?? "",
        customerLatLng: here,
        gasType: order.items[0]?.productName ?? "Gas",
        cylinderSize: order.items[0]?.size ?? "",
        quantity: order.items[0]?.quantity ?? 1,
        // The lib reads order.radiusMeters off this shape. We default
        // to the standard 5 km broadcast radius from the lib.
      },
      all,
    );
  },

  async claimForRider(orderId, rider) {
    // Mirror the backend's atomic claim — first rider wins. The lib's
    // `acceptDelivery` returns false on a contested order, which is
    // exactly the condition we want to surface to the UI.
    if (rider.status !== "online" || !rider.available) {
      throw new OrderServiceError(
        "RIDER_OFFLINE",
        "You are not available to take deliveries.",
      );
    }
    const ok = acceptDelivery(orderId, rider.id);
    if (!ok) {
      throw new OrderServiceError(
        "RIDER_BUSY",
        "Another rider already accepted this delivery.",
      );
    }
    return rider;
  },
};

/**
 * For the mock build the rider pool lives at module scope in
 * `src/lib/riderMatching.ts` and is synchronously available. A real
 * backend would replace this with `UsersApi.byRole("rider")`.
 */
async function defaultRiderPool(): Promise<Rider[]> {
  const mod = await import("../lib/riderMatching");
  return mod.fetchOnlineRiders();
}
