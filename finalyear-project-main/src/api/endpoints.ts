/**
 * Resource-shaped wrappers around the raw ApiClient.
 *
 * Each function maps directly to a Spring Boot endpoint. The store
 * layer calls these instead of `fetch` so the rest of the app stays
 * unaware of HTTP.
 */
import { api } from "./client";
import { ApiError } from "./errors";
import {
  AdminAssignment,
  AdminCustomer,
  AdminNotification,
  AdminOrder,
  AdminProduct,
  AdminReport,
  AdminRider,
  AdminSeller,
  AdminStats,
  AdminUser,
  Complaint,
  GasProduct,
  NotificationItem,
  Order,
  OrderStatus,
  PermitApplication,
  PermitDocument,
  PermitDocumentType,
  PermitStatus,
  RestockRequest,
  Rider,
  SellerPermit,
  SellerProfile,
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

// ---- Seller profiles --------------------------------------------------
// Read access to seller profiles — backs the customer "Nearby Sellers"
// pipeline. Public read; the me/upsert endpoints back the seller profile
// page.
export const SellersApi = {
  list: () => api.get<SellerProfile[]>("/api/sellers"),
  me: () => api.get<SellerProfile>("/api/sellers/me"),
  updateMe: (patch: Partial<SellerProfile>) =>
    api.post<SellerProfile>("/api/sellers/me", patch),
  riders: (sellerId: string) =>
    api.get<Rider[]>(`/api/sellers/${encodeURIComponent(sellerId)}/riders`),
};

// ---- Riders ------------------------------------------------------------
// Rider profiles back the dispatch queue's per-rider filter and the
// rider dashboard.
export const RidersApi = {
  list: (filter?: { available?: boolean }) =>
    api.get<Rider[]>("/api/riders", filter),
  setAvailability: (riderId: string, available: boolean) =>
    api.patch<Rider>(`/api/riders/${encodeURIComponent(riderId)}/availability`, {
      available,
    }),
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

  /**
   * Legacy verb — seller hand-picks a rider. There is no matching
   * backend route (the server enforces atomic claim via
   * {@link OrdersApi.claim}). Calling this in production throws so the
   * store layer's `assignRider` (which now scopes by `seller_riders`)
   * is the only path that mutates the rider assignment.
   */
  assignRider: (_id: string, _riderId: string, _riderName: string): Promise<Order> => {
    return Promise.reject(
      new ApiError(
        "Server-side seller-picks-rider is not supported; use OrdersApi.claim.",
        501,
        "NOT_SUPPORTED",
      ),
    );
  },

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
// Wire shapes for the seller permit verification workflow.
//
// Seller endpoints (SELLER role):
//   GET    /api/permits/me                          → own permit (lazy create)
//   POST   /api/permits/me/documents                → upload a single PDF
//   DELETE /api/permits/me/documents/{id}           → remove a doc before submit
//   POST   /api/permits/me/submit                   → finalise the application
//   GET    /api/permits/me/license                  → stream the issued licence
//   GET    /api/permits/application-form            → download the blank form
//   GET    /api/permits/documents/{id}              → stream a PDF (admin/owner)
//
// Admin endpoints (ADMIN role):
//   GET    /api/admin/permits?status=               → review queue
//   GET    /api/admin/permits/{id}                  → single row
//   GET    /api/admin/permits/{id}/documents        → document metadata
//   POST   /api/admin/permits/{id}/approve          → approve + upload licence
//   POST   /api/admin/permits/{id}/reject           → reject with reason

/** Document slot the seller can fill. `license` is admin-only. */
export type SellerUploadableDocumentType = Exclude<
  PermitDocumentType,
  "license"
>;

export const PermitsApi = {
  // ---- Seller-side --------------------------------------------------
  /** Get the seller's own permit row, creating a draft PENDING row on first call. */
  myPermit: () => api.get<SellerPermit>("/api/permits/me"),

  /** Submit the live application — body must include the chosen `businessName`. */
  submitApplication: (body: { businessName: string }) =>
    api.post<SellerPermit>("/api/permits/me/submit", body),

  /**
   * Upload a single PDF or image for one slot. The caller is responsible
   * for building the {@link FormData} envelope (kept out of this layer so
   * the api package stays DOM-agnostic).
   *
   * Backend expects multipart fields:
   *   - `type`:  one of
   *               application_form | national_id | business_license |
   *               passport_photo
   *   - `file`:  the file blob
   *
   * Per-slot MIME policy (mirrors
   * `PermitDocumentStorageService.ALLOWED_MIME`):
   *   - application_form  — application/pdf
   *   - national_id       — application/pdf | image/jpeg | image/png
   *   - business_license  — application/pdf
   *   - passport_photo    — image/jpeg | image/png
   *
   * Server-side errors throw `ApiError` whose `.message` is the
   * backend's `BadRequestException` text verbatim.
   */
  uploadDocument: (
    form: FormData,
    options?: { timeoutMs?: number },
  ): Promise<PermitDocument> =>
    api.upload<PermitDocument>("/api/permits/me/documents", form, options),

  /** Remove a seller-uploaded document before submission. */
  deleteDocument: (id: string) =>
    api.delete<void>(`/api/permits/me/documents/${encodeURIComponent(id)}`),

  /** Streaming URL for the seller's approved licence. */
  licenseUrl: () => "/api/permits/me/license",

  /** Streaming URL for the blank application form PDF. */
  applicationFormUrl: () => "/api/permits/application-form",

  // ---- Admin-side ---------------------------------------------------
  /** Admin review queue, optionally narrowed by status. */
  listForAdmin: (status?: PermitStatus) =>
    api.get<SellerPermit[]>("/api/admin/permits", status ? { status } : undefined),

  /** Single permit row including documents metadata. */
  getForAdmin: (id: string) =>
    api.get<SellerPermit>(`/api/admin/permits/${encodeURIComponent(id)}`),

  /** Document metadata for the admin viewer. */
  listDocumentsForAdmin: (id: string) =>
    api.get<PermitDocument[]>(
      `/api/admin/permits/${encodeURIComponent(id)}/documents`,
    ),

  /**
   * Approve a permit. Optional `license` multipart file is the admin-
   * uploaded licence PDF; if absent, the seller's download button is
   * disabled until a licence is uploaded.
   */
  approve: (
    id: string,
    form: FormData,
    options?: { timeoutMs?: number },
  ): Promise<SellerPermit> =>
    api.upload<SellerPermit>(
      `/api/admin/permits/${encodeURIComponent(id)}/approve`,
      form,
      options,
    ),

  /** Reject a permit. Body carries the seller-facing reason. */
  reject: (id: string, reason: string) =>
    api.post<SellerPermit>(
      `/api/admin/permits/${encodeURIComponent(id)}/reject`,
      { reason },
    ),

  // ---- Document streaming ------------------------------------------
  /** Streaming URL for any permit PDF the actor is allowed to read. */
  documentUrl: (id: string) =>
    `/api/permits/documents/${encodeURIComponent(id)}`,

  // ---- Mock-mode shims ---------------------------------------------
  // The in-memory mock branch still calls these — they map onto the
  // same SellerPermit shape and are no-ops when USE_MOCK is false.
  list: () =>
    USE_MOCK_FALLBACK
      ? api.get<PermitApplication[]>("/api/permits")
      : Promise.resolve([] as PermitApplication[]),
  /** Legacy mock-only submit — kept for the in-memory branch only. */
  submit: (body: Omit<PermitApplication, "id" | "submittedAt" | "status">) =>
    Promise.resolve<PermitApplication>({
      ...body,
      id: `pm-${Date.now()}`,
      status: "pending",
      submittedAt: new Date().toISOString(),
    }),
  review: (id: string, status: PermitStatus, note?: string) =>
    api.patch<PermitApplication>(`/api/permits/${id}/review`, { status, note }),
};

// Internal helper so the mock-mode shim above stays a single line. The
// value is read at module-init time; the rest of the file doesn't need
// to know about it.
const USE_MOCK_FALLBACK = false;

// ---- Notifications -----------------------------------------------------

export const NotificationsApi = {
  list: () => api.get<NotificationItem[]>("/api/notifications"),
  markRead: (id: string) =>
    api.patch<NotificationItem>(`/api/notifications/${id}/read`),
};

// ---- Admin -------------------------------------------------------------

/**
 * Read surface for the admin module.
 *
 * Every endpoint below is guarded server-side by `AdminGuard` and returns
 * 403 for any non-admin token, so these must only be called from screens
 * under `app/(admin)/`. All of them are aggregations or projections over
 * live tables — there is no mock branch and no client-side fallback.
 *
 * The role-scoped equivalents (`/api/orders`, `/api/products`, …) narrow
 * their results to the caller; these unrestricted views exist so an admin
 * can see the whole system without loosening those guards.
 */
export const AdminApi = {
  /** Every dashboard counter in one call. */
  stats: () => api.get<AdminStats>("/api/admin/stats"),

  /** Order + revenue statistics. Defaults to the last 30 days. */
  reports: (filter?: { from?: string; to?: string; limit?: number }) =>
    api.get<AdminReport>("/api/admin/reports", filter),

  /** The full user directory across every role. */
  users: (filter?: { role?: UserRole; q?: string; active?: boolean }) =>
    api.get<AdminUser[]>("/api/admin/users", filter),

  userById: (id: string) =>
    api.get<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}`),

  /** Customers with lifetime order count and spend. */
  customers: (filter?: { q?: string; active?: boolean }) =>
    api.get<AdminCustomer[]>("/api/admin/customers", filter),

  customerOrders: (id: string) =>
    api.get<AdminOrder[]>(
      `/api/admin/customers/${encodeURIComponent(id)}/orders`,
    ),

  /** Sellers with business profile, permit state and catalogue size. */
  sellers: (filter?: {
    q?: string;
    permitStatus?: PermitStatus;
    active?: boolean;
  }) => api.get<AdminSeller[]>("/api/admin/sellers", filter),

  /** Riders with vehicle details, availability and workload. */
  riders: (filter?: { q?: string; available?: boolean; active?: boolean }) =>
    api.get<AdminRider[]>("/api/admin/riders", filter),

  riderOrders: (id: string) =>
    api.get<AdminOrder[]>(`/api/admin/riders/${encodeURIComponent(id)}/orders`),

  /**
   * Suppliers — users with `role = "supplier"`. There is no supplier
   * profile table, so only user-level fields are available.
   */
  suppliers: (filter?: { q?: string; active?: boolean }) =>
    api.get<AdminUser[]>("/api/admin/suppliers", filter),

  /** Seller↔rider pairings from the `seller_riders` join table. */
  assignments: () => api.get<AdminAssignment[]>("/api/admin/assignments"),

  /** The whole catalogue across every seller, inactive rows included. */
  products: (filter?: {
    q?: string;
    sellerId?: string;
    active?: boolean;
    category?: string;
  }) => api.get<AdminProduct[]>("/api/admin/products", filter),

  /** The complete order book, newest first. */
  orders: (filter?: {
    status?: OrderStatus;
    customerId?: string;
    sellerId?: string;
    riderId?: string;
    q?: string;
    from?: string;
    to?: string;
  }) => api.get<AdminOrder[]>("/api/admin/orders", filter),

  /** One order with its line items, in the canonical `Order` shape. */
  orderById: (id: string) =>
    api.get<Order>(`/api/admin/orders/${encodeURIComponent(id)}`),

  /** Every user's notifications, with the recipient resolved. */
  notifications: (filter?: {
    userId?: string;
    type?: string;
    read?: boolean;
  }) => api.get<AdminNotification[]>("/api/admin/notifications", filter),
};

// ---- Complaints --------------------------------------------------------

export const ComplaintsApi = {
  list: () => api.get<Complaint[]>("/api/complaints"),
  create: (body: Omit<Complaint, "id" | "createdAt" | "status">) =>
    api.post<Complaint>("/api/complaints", body),
  resolve: (id: string) =>
    api.patch<Complaint>(`/api/complaints/${id}/resolve`),
};

// ---- Delivery tracking ------------------------------------------------

/**
 * Wire shape shared by every tracking frame (WebSocket outbound and the
 * REST bootstrap endpoint). Mirrors the backend's
 * `tracking.dto.LocationUpdateMessage`.
 */
export interface LocationUpdateMessage {
  type: "LOCATION_UPDATE" | "ERROR" | "PONG";
  orderId: number;
  riderId: number | null;
  lat: number;
  lng: number;
  headingDeg: number | null;
  speedMps: number | null;
  accuracyM: number | null;
  /**
   * Order status at sample time (e.g. {@code "in_transit"}).
   * Typed as a plain string because the wire format is the
   * backend's lowercase enum literal and the rider may also send
   * arbitrary intermediate states that aren't part of the typed
   * `OrderStatus` union. Consumers should treat unknown values as
   * "non-terminal".
   */
  status: string | null;
  /** ISO-8601 timestamp string from the server clock. */
  ts: string;
  /** Optional human-readable message — only set on ERROR frames. */
  message?: string;
}

/**
 * REST surface for the tracking module. The hot path is the
 * {@code /ws/tracking} WebSocket (see {@link import("../services/TrackingClient")});
 * these endpoints exist so:
 *
 *   • the rider app can publish a sample when the socket handshake is
 *     blocked by a corporate proxy.
 *   • the customer/seller app can bootstrap the rider marker on first
 *     paint without waiting for the first WS frame.
 *
 * Both endpoints share their authorisation rules with the socket by
 * going through the same `DeliveryTrackingService` on the server, so
 * security is defined exactly once.
 */
export const TrackingApi = {
  /** Rider → server: publish a new sample. Returns the broadcast envelope. */
  postLocation: (
    orderId: string,
    body: {
      lat: number;
      lng: number;
      headingDeg?: number;
      speedMps?: number;
      accuracyM?: number;
      status?: string;
      clientTsMs?: number;
    },
  ) => api.post<LocationUpdateMessage>(`/api/orders/${orderId}/location`, body),

  /** Customer / seller → server: bootstrap the rider marker. */
  latest: (orderId: string) =>
    api.get<LocationUpdateMessage>(`/api/orders/${orderId}/tracking/latest`),
};
