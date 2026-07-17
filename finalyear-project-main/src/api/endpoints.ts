/**
 * Resource-shaped wrappers around the raw ApiClient.
 *
 * Each function maps directly to a Spring Boot endpoint. The store
 * layer calls these instead of `fetch` so the rest of the app stays
 * unaware of HTTP.
 */
import { api } from "./client";
import {
  Complaint,
  GasProduct,
  NotificationItem,
  Order,
  OrderStatus,
  PermitApplication,
  PermitStatus,
  RestockRequest,
  User,
  UserRole,
} from "../../constants/types";

// ---- Auth --------------------------------------------------------------

export interface LoginPayload {
  /**
   * Username or email — the backend's `LoginRequest` accepts either as
   * `identifier` and dispatches to the correct lookup based on whether
   * the value contains "@".
   */
  identifier: string;
  password: string;
}

export interface RegisterPayload {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
}

export const AuthApi = {
  login: (body: LoginPayload) =>
    api.post<{ user: User; token: string }>("/api/auth/login", body),
  register: (body: RegisterPayload) =>
    api.post<{ user: User; token: string }>("/api/auth/register", body),
  me: () => api.get<User>("/api/auth/me"),
};

// ---- Users -------------------------------------------------------------

export const UsersApi = {
  list: () => api.get<User[]>("/api/users"),
  byId: (id: string) => api.get<User>(`/api/users/${id}`),
  setStatus: (id: string, active: boolean) =>
    api.patch<User>(`/api/users/${id}/status`, { active }),
  /**
   * Patch a user's profile. Accepts any subset of the writable fields
   * (fullName, username, email, phone, address, district, region, lat,
   * lng). Server returns the updated user record.
   */
  updateProfile: (
    id: string,
    patch: Partial<Omit<User, "id" | "role" | "createdAt">>,
  ) => api.patch<User>(`/api/users/${id}`, patch),
};

// ---- Products ----------------------------------------------------------

export const ProductsApi = {
  list: () => api.get<GasProduct[]>("/api/products"),
  bySeller: (sellerId: string) =>
    api.get<GasProduct[]>(`/api/products?sellerId=${encodeURIComponent(sellerId)}`),
  create: (body: Omit<GasProduct, "id">) =>
    api.post<GasProduct>("/api/products", body),
  updateStock: (id: string, stock: number) =>
    api.patch<GasProduct>(`/api/products/${id}/stock`, { stock }),
};

// ---- Orders ------------------------------------------------------------

/**
 * Server endpoints backing the Order Flow.
 *
 * The clean-architecture service layer (`src/services/OrderService.ts`)
 * should be the only caller of these in production code. The existing
 * `placeOrder/updateOrderStatus/assignRider` helpers in the store are
 * still here so the in-memory mock branch keeps working; they delegate
 * to the same HTTP shapes.
 *
 * Endpoints documented for the Spring Boot team:
 *   POST   /api/orders                  create
 *   GET    /api/orders                  list (?customerId|sellerId|riderId)
 *   POST   /api/orders/{id}/accept      seller accepts
 *   POST   /api/orders/{id}/reject      seller rejects
 *   POST   /api/orders/{id}/cancel      customer cancels (pending only)
 *   POST   /api/orders/{id}/claim       rider self-assigns (atomic)
 *   PATCH  /api/orders/{id}/status      rider advances delivery
 *   GET    /api/orders/dispatch/available   proximity-sorted queue
 */
export const OrdersApi = {
  list: (filter?: { customerId?: string; sellerId?: string; riderId?: string }) =>
    api.get<Order[]>("/api/orders", filter),

  create: (body: Omit<Order, "id" | "createdAt" | "updatedAt" | "status">) =>
    api.post<Order>("/api/orders", body),

  /** Legacy verb kept for the in-memory mock branch. */
  updateStatus: (id: string, status: OrderStatus) =>
    api.patch<Order>(`/api/orders/${id}/status`, { status }),

  /** Legacy verb kept for the in-memory mock branch. */
  assignRider: (id: string, riderId: string, riderName: string) =>
    api.patch<Order>(`/api/orders/${id}/rider`, { riderId, riderName }),

  /** Seller (owner) accepts a pending order. */
  accept: (id: string) => api.post<Order>(`/api/orders/${id}/accept`, {}),

  /** Seller (owner) rejects a pending order. `reason` is captured. */
  reject: (id: string, reason?: string) =>
    api.post<Order>(`/api/orders/${id}/reject`, {
      reason: reason ?? null,
    }),

  /** Customer (owner) cancels a pending order. */
  cancel: (id: string, reason?: string) =>
    api.post<Order>(`/api/orders/${id}/cancel`, {
      reason: reason ?? null,
    }),

  /**
   * Rider self-assigns an accepted order. Atomic on the server — a 409
   * is returned if another rider already claimed.
   */
  claim: (id: string, riderId: string, riderName: string) =>
    api.post<Order>(`/api/orders/${id}/claim`, { riderId, riderName }),

  /**
   * Backend's proximity-ranked queue of orders a rider is eligible to
   * claim. Filter is optional — the server applies a default radius.
   */
  availableForRiders: (filter: {
    lat?: number;
    lng?: number;
    radiusM?: number;
  } = {}) => api.get<Order[]>("/api/orders/dispatch/available", filter),
};

// ---- Restock -----------------------------------------------------------

export const RestockApi = {
  list: () => api.get<RestockRequest[]>("/api/restock"),
  create: (body: Omit<RestockRequest, "id" | "createdAt" | "status">) =>
    api.post<RestockRequest>("/api/restock", body),
  updateStatus: (id: string, status: RestockRequest["status"]) =>
    api.patch<RestockRequest>(`/api/restock/${id}/status`, { status }),
};

// ---- Permits -----------------------------------------------------------

export const PermitsApi = {
  list: () => api.get<PermitApplication[]>("/api/permits"),
  submit: (body: Omit<PermitApplication, "id" | "submittedAt" | "status">) =>
    api.post<PermitApplication>("/api/permits", body),
  review: (id: string, status: PermitStatus, note?: string) =>
    api.patch<PermitApplication>(`/api/permits/${id}/review`, { status, note }),
};

// ---- Notifications -----------------------------------------------------

export const NotificationsApi = {
  list: () => api.get<NotificationItem[]>("/api/notifications"),
  markRead: (id: string) =>
    api.patch<NotificationItem>(`/api/notifications/${id}/read`),
};

// ---- Complaints --------------------------------------------------------

export const ComplaintsApi = {
  list: () => api.get<Complaint[]>("/api/complaints"),
  create: (body: Omit<Complaint, "id" | "createdAt" | "status">) =>
    api.post<Complaint>("/api/complaints", body),
  resolve: (id: string) =>
    api.patch<Complaint>(`/api/complaints/${id}/resolve`),
};
