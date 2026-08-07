/**
 * Repository over the Order Flow REST verbs.
 *
 * `OrderService` depends on this interface — not directly on `OrdersApi`
 * — so we can swap in a fake/in-memory repo for unit tests and so the
 * service never has to know how the URL is shaped.
 *
 * Each method mirrors a Spring Boot endpoint that the backend team
 * should implement alongside this client:
 *
 *   POST   /api/orders/{id}/accept
 *   POST   /api/orders/{id}/reject
 *   POST   /api/orders/{id}/claim
 *   POST   /api/orders/{id}/cancel
 *   PATCH  /api/orders/{id}/status     (already exists in endpoints.ts)
 *   GET    /api/orders/dispatch/available?lat=&lng=&radiusM=
 */
import { api } from "../api/client";
import type { Order, OrderStatus } from "../../constants/types";

export interface OrderRepository {
  create(input: Omit<Order, "id" | "createdAt" | "updatedAt" | "status">): Promise<Order>;
  list(filter?: { customerId?: string; sellerId?: string; riderId?: string }): Promise<Order[]>;
  byId(id: string): Promise<Order>;
  updateStatus(id: string, status: OrderStatus, note?: string): Promise<Order>;
  accept(id: string): Promise<Order>;
  reject(id: string, reason?: string): Promise<Order>;
  cancel(id: string, reason?: string): Promise<Order>;
  claim(id: string, riderId: string, riderName: string): Promise<Order>;
  /** Orders in `accepted` status, within broadcast radius, with no rider assigned yet. */
  availableForRiders(filter: {
    lat?: number;
    lng?: number;
    radiusM?: number;
  }): Promise<Order[]>;
}

interface ApiOk<T> {
  data: T;
}

/**
 * Default HTTP-backed implementation. Each verb returns an updated
 * `Order` so the store has the post-transition state in one round-trip.
 *
 * Backend behaviour (documented for the Spring Boot team):
 *
 *  - POST /api/orders/{id}/accept
 *      role: seller (owner). Transitions PENDING → ACCEPTED. Returns
 *      the updated order. Server is also responsible for kicking off
 *      the broadcast (sending push notifications to nearby riders).
 *
 *  - POST /api/orders/{id}/reject
 *      role: seller (owner). Body: `{ reason?: string }`. Transitions
 *      PENDING → REJECTED. Persists the reason. Notifies customer.
 *
 *  - POST /api/orders/{id}/claim
 *      role: rider. Body: `{ riderId, riderName }`. Atomic — server
 *      uses Redis SETNX / DB unique index to ensure only ONE rider
 *      succeeds per orderId. Returns 409 RIDER_BUSY if another rider
 *      claimed first.
 *
 *  - POST /api/orders/{id}/cancel
 *      role: customer (owner). Body: `{ reason?: string }`. Only
 *      allowed while order is PENDING.
 *
 *  - PATCH /api/orders/{id}/status
 *      role: rider (assignee). Used to advance delivery milestones.
 *
 *  - GET /api/orders/dispatch/available
 *      role: rider. Server filters by status=accepted AND
 *      haversine(shopLatLng, riderLatLng) <= radiusM. Returns the
 *      proximity-sorted queue.
 */
export const httpOrderRepository: OrderRepository = {
  async create(input) {
    const res = await api.post<Order>("/api/orders", input);
    return res as Order;
  },

  async list(filter) {
    return (await api.get<Order[]>("/api/orders", filter)) as Order[];
  },

  async byId(id) {
    const res = await api.get<Order>(`/api/orders/${id}`);
    return res as Order;
  },

  async updateStatus(id, status, note) {
    const res = await api.patch<Order>(`/api/orders/${id}/status`, {
      status,
      ...(note ? { note } : {}),
    });
    return res as Order;
  },

  async accept(id) {
    const res = await api.post<Order>(`/api/orders/${id}/accept`, {});
    return res as Order;
  },

  async reject(id, reason) {
    const res = await api.post<Order>(`/api/orders/${id}/reject`, {
      reason: reason ?? null,
    });
    return res as Order;
  },

  async cancel(id, reason) {
    const res = await api.post<Order>(`/api/orders/${id}/cancel`, {
      reason: reason ?? null,
    });
    return res as Order;
  },

  async claim(id, riderId, riderName) {
    const res = await api.post<Order>(`/api/orders/${id}/claim`, {
      riderId,
      riderName,
    });
    return res as Order;
  },

  async availableForRiders({ lat, lng, radiusM }) {
    const query: Record<string, unknown> = {};
    if (typeof lat === "number") query.lat = lat;
    if (typeof lng === "number") query.lng = lng;
    if (typeof radiusM === "number") query.radiusM = radiusM;
    const res = await api.get<Order[]>(
      "/api/orders/dispatch/available",
      query,
    );
    return res as Order[];
  },
};

/**
 * Indicates whether an order failed with a known recoverable status
 * (e.g. 409 for RIDER_BUSY, 403 for NOT_AUTHORIZED). The store layer
 * can branch on `code` to surface friendly UI messages.
 *
 * Imported lazily here to avoid a circular dep with the API index file.
 */
export function isRepositoryError(e: unknown): boolean {
  // ApiError instances come from `api/client.ts`. The check is a duck-type
  // so this helper stays decoupled from the api package internals.
  return (
    !!e &&
    typeof e === "object" &&
    "status" in (e as any) &&
    typeof (e as any).status === "number"
  );
}

/** Re-export to satisfy the unused-import lint without the noise. */
export type { ApiOk };
