/**
 * Service façade for the rider broadcast / dispatch flow.
 *
 * Goals:
 *   • Hide the in-memory claim-lock implementation behind a stable interface
 *     so the store layer doesn't import the lib directly.
 *   • Provide a single function that takes an `Order` and:
 *       - returns the proximity-ordered list of eligible riders
 *       - writes an audit trail (in-app notifications per rider)
 *       - tries the atomic claim lock on behalf of the rider
 *
 * Real integration (documented for the backend team):
 *   • `eligibleRidersForOrder` is implemented server-side at
 *     `GET /api/orders/dispatch/available`. The frontend no longer
 *     maintains a local rider pool — the backend is the source of truth.
 *   • `claimForRider(orderId, riderId)` is implemented server-side at
 *     `POST /api/orders/{id}/claim`. The server uses an atomic UPDATE
 *     to make sure only the first rider succeeds; everyone else gets
 *     a conflict and we throw `RIDER_BUSY`.
 *
 * NOTE: seed/mock rider pool and seller↔rider assignment were removed.
 * The broadcast service now returns the empty eligible-rider list
 * (the backend fires the real broadcast when the seller accepts), and
 * the claim lock short-circuits to "true" because the server's
 * atomic claim is the actual lock today.
 */
import type { Order } from "../../constants/types";
import { OrderServiceError } from "./orderErrors";

export interface Rider {
  id: string;
  fullName: string;
  phone: string;
  status: "online" | "offline" | "on_delivery";
  available: boolean;
  vehicle?: string;
  rating?: number;
  lat: number;
  lng: number;
}

export interface RiderBroadcastService {
  /**
   * Riders who are online, available, and within `radiusM` of the
   * shop — sorted by proximity (closest first).
   *
   * The live system answers this through
   * `GET /api/orders/dispatch/available` so the local service just
   * returns `[]` and lets the backend drive the broadcast.
   */
  eligibleRidersForOrder(order: Order): Promise<Rider[]>;
  /**
   * Try to claim an order for a specific rider. Returns the rider if
   * the rider wins the race, throws `RIDER_BUSY` if another rider
   * already claimed.
   */
  claimForRider(orderId: string, rider: Rider): Promise<Rider>;
}

/**
 * Default implementation. The backend owns rider eligibility and the
 * claim lock today, so the local stub is intentionally minimal.
 */
export const defaultRiderBroadcastService: RiderBroadcastService = {
  async eligibleRidersForOrder(_order) {
    // Backend will broadcast on accept via /api/orders/dispatch/available.
    return [];
  },

  async claimForRider(_orderId, rider) {
    if (rider.status !== "online" || !rider.available) {
      throw new OrderServiceError(
        "RIDER_OFFLINE",
        "You are not available to take deliveries.",
      );
    }
    // The atomic claim lives server-side at POST /api/orders/{id}/claim
    // — local short-circuit returns the rider so the store's caller
    // can continue; the repo will raise RIDER_BUSY on contention.
    return rider;
  },
};
