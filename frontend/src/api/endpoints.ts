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
  CustomerLocation,
  DeliveryRoute,
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
  RiderApplicationDocument,
  RiderAssignedSeller,
  RiderPermitSummary,
  RiderTeam,
  SellerPermit,
  SellerProfile,
  SupplierApplication,
  SupplierApplicationDocument,
  User,
  UserRole,
  Vehicle,
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

// ---- Customer location -------------------------------------------------
// The signed-in customer's saved location, persisted in
// `customer_profiles`. This is the official customer location: it is
// loaded once after login and drives the "Nearby Sellers" pipeline, so
// the customer never has to re-enter their address.
export const CustomersApi = {
  /**
   * The saved location. Returns a payload with all-null fields (200,
   * not 404) when the customer has never saved one.
   */
  myLocation: () => api.get<CustomerLocation>("/api/customers/me"),
  /**
   * Persist the location. The backend validates the required fields and
   * geocodes `address`, so the response carries the resolved
   * `lat`/`lng` — merge the *response* into the session, not the patch.
   */
  updateMyLocation: (patch: CustomerLocation) =>
    api.put<CustomerLocation>("/api/customers/me", patch),
  /**
   * Patch the signed-in customer's editable personal fields on the
   * `users` row: full name, username, email, phone. Each field is
   * optional — null means "don't touch". Used by the Profile screen's
   * "personal information" half of the save flow. The route lives on
   * the customer-scoped URL so the actor id comes from the auth
   * filter rather than the path.
   */
  patchMyProfile: (patch: {
    fullName?: string;
    username?: string;
    email?: string;
    phone?: string;
  }) =>
    api.patch<{
      fullName: string;
      username: string;
      email: string;
      phone: string;
    }>("/api/customers/me", patch),
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
  /**
   * Public list endpoint backing the customer "Nearby Sellers" screen.
   *
   * When the caller passes `lat` / `lng` the backend filters to the
   * configured nearby radius and returns rows sorted by distance. Without
   * coordinates the backend returns every approved+active seller
   * (alphabetical) — used by admin / debug surfaces.
   */
  list: (filter?: { lat?: number; lng?: number; radiusKm?: number }) =>
    api.get<SellerProfile[]>("/api/sellers", filter),
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
  /**
   * The signed-in rider's own profile. Backed by `rider_profiles` joined
   * with `users`; surfaces every field the Rider Profile screen needs
   * (region, district, address, national ID, vehicle, licence).
   */
  me: () => api.get<Rider>("/api/riders/me"),
  /**
   * Patch the signed-in rider's editable contact / location fields
   * (phone, region, district, address, lat, lng). Backend refuses with
   * 403 if the rider has not been approved — same gate as the admin
   * approval requirement described in the brief.
   */
  updateMyContact: (patch: {
    phone?: string | null;
    region?: string | null;
    district?: string | null;
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
  }) => api.patch<Rider>("/api/riders/me", patch),

  /**
   * Fetch the rider's seller + every other approved rider sharing that
   * seller. The signed-in rider is always part of the team and the
   * client highlights their own row. Used by the My Team page.
   */
  team: () => api.get<RiderTeam>("/api/riders/me/team"),

  /**
   * The seller the signed-in rider is currently assigned to. The
   * backend returns HTTP 204 (no body) when no assignment exists yet
   * so the frontend can render the brief's waiting message verbatim.
   *
   * Note: the bare `api.get` rejects on a 204, so callers should use
   * {@link RidersApi.assignedSellerOrNull} below for the not-assigned
   * path; this entry point is kept for callers that want to surface
   * the raw error (e.g. an analytics event).
   */
  assignedSeller: () =>
    api.get<RiderAssignedSeller>("/api/riders/me/assigned-seller"),
  /**
   * Convenience wrapper around {@link RidersApi.assignedSeller} that
   * resolves to `null` when the rider hasn't been assigned yet. Maps
   * the HTTP 204 response to a `null` payload so the React Native
   * client can render the brief's waiting message without
   * try/catching the ApiError.
   */
  assignedSellerOrNull: async (): Promise<RiderAssignedSeller | null> => {
    try {
      return await api.get<RiderAssignedSeller>(
        "/api/riders/me/assigned-seller",
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 204) {
        return null;
      }
      throw err;
    }
  },
};

// ---- Rider permits -----------------------------------------------------
// Rider-facing permit + verification workflow. The backend exposes:
//   - `/api/riders/me/permit*` (legacy certificate summary from part 1,
//     reusing `seller_permits` so the Profile screen continues to work)
//   - `/api/rider-permits/me/*` (the new verification workflow — upload
//     docs, submit, admin review, official certificate PDF)
export const RiderPermitsApi = {
  // ---- Legacy certificate summary (part 1) ----
  /** The rider's permit summary, or rejects with 404 when no permit exists yet. */
  myPermit: () => api.get<RiderPermitSummary>("/api/riders/me/permit"),
  /**
   * Server-relative URL for the rider's approved certificate PDF
   * (legacy certificate endpoint from part 1).
   */
  certificateUrl: () => "/api/riders/me/permit/certificate",
  /** Resolves to `null` when the rider has no permit yet. */
  myPermitOrNull: async (): Promise<RiderPermitSummary | null> => {
    try {
      return await api.get<RiderPermitSummary>("/api/riders/me/permit");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  },

  // ---- Verification workflow ----
  /**
   * The signed-in rider's full verification application (lazy-creates a
   * draft PENDING row on first call).
   */
  myApplication: () => api.get<RiderPermitSummary>("/api/rider-permits/me"),
  /** Server-relative URL for the blank Rider Application Form PDF. */
  applicationFormUrl: () => "/api/rider-permits/me/application-form",
  /**
   * Upload a single PDF or image for one slot. The caller builds the
   * multipart `FormData` (kept out of this layer so the api package
   * stays DOM-agnostic).
   *
   * Backend expects multipart fields:
   *   - `type`:  one of `rider_application_form | rider_national_id |
   *               rider_driving_licence | rider_passport_photo |
   *               rider_vehicle_registration`
   *   - `file`:  the file blob
   */
  uploadDocument: (
    type: string,
    form: FormData,
    options?: { timeoutMs?: number },
  ): Promise<RiderApplicationDocument> =>
    api.upload<RiderApplicationDocument>(
      "/api/rider-permits/me/documents",
      form,
      { ...options, query: { type } },
    ),
  /** Remove a rider-uploaded document before submission. */
  deleteDocument: (id: string) =>
    api.delete<void>(`/api/rider-permits/me/documents/${encodeURIComponent(id)}`),
  /** Submit the live application — validates required slots + notifies the rider. */
  submitApplication: () =>
    api.post<RiderPermitSummary>("/api/rider-permits/me/submit", {}),
  /** Streaming URL for the official Gas Delivery Rider Certificate PDF. */
  riderCertificateUrl: () => "/api/rider-permits/me/certificate",
  /** Streaming URL for any document the rider is allowed to read. */
  documentUrl: (id: string) => `/api/rider-permits/documents/${encodeURIComponent(id)}`,
  /**
   * Convenience wrapper that resolves to `null` when the rider has not
   * yet started an application. Mirrors {@link RidersApi.assignedSellerOrNull}.
   */
  myApplicationOrNull: async (): Promise<RiderPermitSummary | null> => {
    try {
      return await api.get<RiderPermitSummary>("/api/rider-permits/me");
    } catch (err) {
      // The lazy-create path should never 404 (it creates a PENDING
      // row on first call), but a defensive catch keeps the caller
      // symmetric with the other `*OrNull` wrappers.
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  },
};

// ---- Admin: rider permits ----------------------------------------------
// Admin review surface for rider verification applications. Mirrors
// the seller-permit admin API (`PermitsApi.admin*`).
export const AdminRiderPermitsApi = {
  /** Review queue, optionally narrowed by status. */
  listForAdmin: (status?: PermitStatus) =>
    api.get<RiderPermitSummary[]>(
      "/api/admin/rider-permits",
      status ? { status } : undefined,
    ),
  /** Single application row including documents metadata. */
  getForAdmin: (id: string) =>
    api.get<RiderPermitSummary>(`/api/admin/rider-permits/${encodeURIComponent(id)}`),
  /** Document metadata for the admin viewer. */
  listDocumentsForAdmin: (id: string) =>
    api.get<RiderApplicationDocument[]>(
      `/api/admin/rider-permits/${encodeURIComponent(id)}/documents`,
    ),
  /**
   * Server-relative streaming URL for the official Gas Delivery Rider
   * Certificate PDF, regenerable on demand by the backend (APPROVED only).
   */
  adminCertificateUrl: (id: string) =>
    `/api/admin/rider-permits/${encodeURIComponent(id)}/certificate`,
  /** Approve the application (no file body required — JSON POST). */
  approveJson: (id: string): Promise<RiderPermitSummary> =>
    api.post<RiderPermitSummary>(
      `/api/admin/rider-permits/${encodeURIComponent(id)}/approve`,
      {},
    ),
  /** Reject the application. Body carries the rider-facing reason. */
  reject: (id: string, reason: string): Promise<RiderPermitSummary> =>
    api.post<RiderPermitSummary>(
      `/api/admin/rider-permits/${encodeURIComponent(id)}/reject`,
      { reason },
    ),
  /** Streaming URL for any document the admin is allowed to read. */
  documentUrl: (id: string) =>
    `/api/rider-permits/documents/${encodeURIComponent(id)}`,
};

// ---- Supplier applications ---------------------------------------------
// Supplier-facing verification workflow. Mirrors `RiderPermitsApi`:
// download the blank form, upload/replace/remove the six required
// documents, submit, then (post-approval only) stream the official
// Gas Supplier Certificate PDF.
export const SupplierApplicationsApi = {
  /**
   * The signed-in supplier's full verification application
   * (lazy-creates a draft PENDING row on first call).
   */
  myApplication: () =>
    api.get<SupplierApplication>("/api/supplier-applications/me"),
  /** Server-relative URL for the blank Supplier Application Form PDF. */
  applicationFormUrl: () => "/api/supplier-applications/me/application-form",
  /**
   * Upload a single PDF or image for one slot. The caller builds the
   * multipart `FormData` (kept out of this layer so the api package
   * stays DOM-agnostic).
   *
   * Backend expects:
   *   - `type` query param: one of `supplier_application_form |
   *      supplier_national_id | supplier_business_registration |
   *      supplier_tin_certificate | supplier_business_licence |
   *      supplier_passport_photo`
   *   - `file` multipart part: the file blob
   */
  uploadDocument: (
    type: string,
    form: FormData,
    options?: { timeoutMs?: number },
  ): Promise<SupplierApplicationDocument> =>
    api.upload<SupplierApplicationDocument>(
      "/api/supplier-applications/me/documents",
      form,
      { ...options, query: { type } },
    ),
  /** Remove a supplier-uploaded document before submission. */
  deleteDocument: (id: string) =>
    api.delete<void>(
      `/api/supplier-applications/me/documents/${encodeURIComponent(id)}`,
    ),
  /** Submit the application — validates required slots + notifies the supplier. */
  submitApplication: () =>
    api.post<SupplierApplication>("/api/supplier-applications/me/submit", {}),
  /**
   * Streaming URL for the official Gas Supplier Certificate PDF. Only
   * resolves once the application is APPROVED — the backend returns
   * HTTP 409 before that.
   */
  certificateUrl: () => "/api/supplier-applications/me/certificate",
  /** Streaming URL for any document the supplier is allowed to read. */
  documentUrl: (id: string) =>
    `/api/supplier-applications/documents/${encodeURIComponent(id)}`,
  /**
   * Convenience wrapper that resolves to `null` when the supplier has
   * not yet started an application. Mirrors
   * {@link RiderPermitsApi.myApplicationOrNull}.
   */
  myApplicationOrNull: async (): Promise<SupplierApplication | null> => {
    try {
      return await api.get<SupplierApplication>("/api/supplier-applications/me");
    } catch (err) {
      // The lazy-create path should never 404 (it creates a PENDING
      // row on first call), but a defensive catch keeps the caller
      // symmetric with the other `*OrNull` wrappers.
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  },
};

// ---- Admin: supplier applications --------------------------------------
// Admin review surface for supplier verification applications. Mirrors
// `AdminRiderPermitsApi`.
export const AdminSupplierApplicationsApi = {
  /** Review queue, optionally narrowed by status. */
  listForAdmin: (status?: PermitStatus) =>
    api.get<SupplierApplication[]>(
      "/api/admin/supplier-applications",
      status ? { status } : undefined,
    ),
  /** Single application row including documents metadata. */
  getForAdmin: (id: string) =>
    api.get<SupplierApplication>(
      `/api/admin/supplier-applications/${encodeURIComponent(id)}`,
    ),
  /** Document metadata for the admin viewer. */
  listDocumentsForAdmin: (id: string) =>
    api.get<SupplierApplicationDocument[]>(
      `/api/admin/supplier-applications/${encodeURIComponent(id)}/documents`,
    ),
  /**
   * Server-relative streaming URL for the official Gas Supplier
   * Certificate PDF, regenerable on demand by the backend (APPROVED only).
   */
  adminCertificateUrl: (id: string) =>
    `/api/admin/supplier-applications/${encodeURIComponent(id)}/certificate`,
  /** Approve the application (no file body required — JSON POST). */
  approve: (id: string): Promise<SupplierApplication> =>
    api.post<SupplierApplication>(
      `/api/admin/supplier-applications/${encodeURIComponent(id)}/approve`,
      {},
    ),
  /** Reject the application. Body carries the supplier-facing reason. */
  reject: (id: string, reason: string): Promise<SupplierApplication> =>
    api.post<SupplierApplication>(
      `/api/admin/supplier-applications/${encodeURIComponent(id)}/reject`,
      { reason },
    ),
  /** Streaming URL for any document the admin is allowed to read. */
  documentUrl: (id: string) =>
    `/api/supplier-applications/documents/${encodeURIComponent(id)}`,
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
    type: string,
    form: FormData,
    options?: { timeoutMs?: number },
  ): Promise<PermitDocument> =>
    api.upload<PermitDocument>(
      "/api/permits/me/documents",
      form,
      { ...options, query: { type } },
    ),

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
   * Server-relative streaming URL for the official Gas Selling Permit PDF,
   * regenerable on demand by the backend. Admin-gated — the server
   * re-renders the issued licence using the latest application + review
   * data, so the admin can view / re-download it even when no
   * admin-uploaded licence file is attached to the permit row.
   */
  adminLicenseUrl: (id: string) =>
    `/api/admin/permits/${encodeURIComponent(id)}/license`,

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

  /**
   * Approve a permit WITHOUT uploading a license file. Sends a regular
   * JSON `POST` instead of an empty `multipart/form-data` envelope.
   * Empty multipart bodies are the documented source of RN's
   * "Network request failed" error on Hermes, so we avoid the envelope
   * entirely when there's nothing to upload. The backend's
   * `AdminPermitController.approve` accepts both content types — when
   * this JSON path is taken, the `license` parameter is `null`.
   */
  approveJson: (id: string): Promise<SellerPermit> =>
    api.post<SellerPermit>(
      `/api/admin/permits/${encodeURIComponent(id)}/approve`,
      {},
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
  /**
   * Mark every notification belonging to the currently authenticated
   * user as read in a single round-trip. Scoped to the actor's user_id
   * on the backend, so this endpoint only ever touches the caller's own
   * rows — calling it from a seller session only marks the seller's
   * notifications, never another role's.
   */
  markAllRead: () =>
    api.post<{ updated: number }>("/api/notifications/read-all"),
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

// ---- Supplier logistics: routes + vehicles -----------------------------
// Backed by the supplier module's SupplierLogisticsController. The
// endpoints are scoped to the signed-in supplier; no client-side
// filter is applied because the backend already returns only that
// supplier's rows.
export const RoutesApi = {
  list: () => api.get<DeliveryRoute[]>("/api/routes"),
  create: (body: {
    name: string;
    scheduleDay: string;
    scheduleTime: string;
  }) => api.post<DeliveryRoute>("/api/routes", body),
  setActive: (id: string, active: boolean) =>
    api.patch<DeliveryRoute>(
      `/api/routes/${encodeURIComponent(id)}/active`,
      { active },
    ),
};

export const VehiclesApi = {
  list: () => api.get<Vehicle[]>("/api/vehicles"),
  create: (body: { plate: string; model: string; capacityKg: number }) =>
    api.post<Vehicle>("/api/vehicles", body),
  setActive: (id: string, active: boolean) =>
    api.patch<Vehicle>(
      `/api/vehicles/${encodeURIComponent(id)}/active`,
      { active },
    ),
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
