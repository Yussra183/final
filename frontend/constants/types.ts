/**
 * Domain types for the Gas Delivery and Supplying System.
 * Designed to map cleanly to a future Spring Boot REST API.
 */

export type UserRole = "customer" | "seller" | "supplier" | "rider" | "admin";

export type OrderStatus =
  | "pending"
  | "accepted"
  | "assigned"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "cancelled"
  | "rejected";

export type PermitStatus =
  | "draft"
  | "pending"
  | "under_review"
  | "approved"
  | "rejected";

/**
 * The PDF slots persisted under `permit_documents.document_type`.
 * `license` (the Gas Selling Permit) is admin-issued on approval; the
 * remainder are the seller-uploaded documents required for submission.
 */
export type PermitDocumentType =
  | "application_form"
  | "national_id"
  | "business_license"
  | "passport_photo"
  | "license";

/**
 * Metadata for one permit PDF (either seller-uploaded or admin-uploaded).
 * `downloadUrl` is a server-relative path the client can hit directly when
 * authenticated.
 */
export interface PermitDocument {
  id: string;
  documentType: PermitDocumentType;
  originalName: string;
  sizeBytes: number;
  contentType: string;
  uploadedAt: string;
  /** Server-relative path under `/api/permits/documents/{id}` etc. */
  downloadUrl: string;
}

/**
 * Server-side projection of a permit application. Mirrors the backend's
 * `SellerPermitDto` (see `permit.dto.SellerPermitDto`).
 */
export interface SellerPermit {
  id: string;
  sellerId: string;
  sellerName: string;
  businessName: string;
  status: PermitStatus;
  documents: PermitDocument[];
  rejectionReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
}

export interface User {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  role: UserRole;
  createdAt: string;
  /**
   * Customer-profile location. Persisted in `customer_profiles` on the
   * backend and loaded once after login via `GET /api/customers/me`.
   * This is the official customer location: the home-screen "Nearby
   * Sellers" pipeline sorts approved sellers by their distance from
   * `lat` / `lng`, which the backend derives from `address` on save.
   */
  businessName?: string;
  address?: string;
  district?: string;
  region?: string;
  /** Ward within the district. Part of the saved customer location. */
  ward?: string;
  /** Street / area line. Part of the saved customer location. */
  street?: string;
  lat?: number;
  lng?: number;
  /**
   * Mirror of `users.is_active` from the backend. For SELLER accounts a
   * false value means the permit is still pending, rejected, or has never
   * been submitted — the seller UI gates every business operation on
   * `isActive === true`. Other roles always have `isActive === true`.
   */
  isActive?: boolean;
  /**
   * Permit status for the current user when their role is SELLER. The
   * seller layout surfaces a "Pending Verification" banner when this is
   * anything other than "approved". Populated by `GET /api/permits/me`.
   */
  permitStatus?: PermitStatus | null;
  /**
   * Seller rating (0..5). Sourced from
   * {@link SellerProfile.rating} via {@code GET /api/sellers/me} on
   * the seller branch of {@code StoreContext.refresh()}. Undefined for
   * non-seller roles; the seller Profile screen renders it through
   * the shared Stars component rather than a hardcoded value.
   */
  rating?: number;
}

/**
 * Normalized location handle used by helpers that filter sellers by
 * proximity. Kept separate from `User` so the same shape works for
 * future inputs (GPS, manual override, geocoded lookup, etc).
 */
export interface Location {
  address?: string;
  district?: string;
  region?: string;
  lat?: number;
  lng?: number;
}

/**
 * The customer's saved location — the wire shape of
 * `GET/PUT /api/customers/me` (backend `CustomerLocationDto`).
 *
 * Field names deliberately match the `User` interface above so the store
 * can merge a response straight onto `session.user` with no remapping.
 *
 * On write, `region` / `district` / `street` are required and `lat` /
 * `lng` are omitted — the backend geocodes `address` and returns the
 * resolved coordinates. On read, every field may be null for a customer
 * who has not saved a location yet.
 */
export interface CustomerLocation {
  region?: string | null;
  district?: string | null;
  ward?: string | null;
  street?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface AuthSession {
  user: User;
  token: string;
}

export interface GasProduct {
  id: string;
  sellerId: string;
  sellerName: string;
  name: string; // e.g. "6kg LPG Refill"
  size: string; // e.g. "6kg", "13kg", "22kg"
  price: number;
  stock: number;
  lowStockThreshold?: number; // FR-05 — backend-driven threshold
  image?: string; // emoji placeholder
  description: string;
  category: "refill" | "new_cylinder" | "accessory";
}

export interface OrderItem {
  productId: string;
  productName: string;
  size: string;
  quantity: number;
  unitPrice: number;
}

export interface DeliveryLocation {
  address: string;
  lat?: number;
  lng?: number;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  sellerId: string;
  sellerName: string;
  riderId?: string;
  riderName?: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  deliveryLocation: DeliveryLocation;
  /**
   * Customer-supplied phone for THIS delivery. The seller's profile phone
   * is on `User.phone`; the rider phone surfaces from `User.phone` once
   * assigned. This is what the rider calls on arrival.
   */
  phone?: string;
  notes?: string;
  /**
   * Captured reason when a seller rejects an order or a customer cancels
   * before the seller acts. Surfaced to the other party verbatim.
   */
  rejectReason?: string;
}

export interface RestockRequest {
  id: string;
  sellerId: string;
  sellerName: string;
  supplierId?: string;
  supplierName?: string;
  productName: string;
  size: string;
  quantity: number;
  status: "pending" | "approved" | "rejected" | "in_transit" | "delivered";
  createdAt: string;
}

export interface PermitApplication {
  id: string;
  sellerId: string;
  sellerName: string;
  businessName: string;
  businessAddress: string;
  businessType: string;
  registrationNumber: string;
  /**
   * Kept as `string[]` for backwards compatibility with the in-memory
   * mock branch. The live backend now returns `PermitDocument[]` (see
   * {@link SellerPermit}); consumers should migrate to `SellerPermit`.
   */
  documents: string[];
  status: PermitStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type:
    | "order"
    | "delivery"
    | "permit"
    | "stock"
    | "system"
    | "near_arrival"
    | "trip_started"
    | "trip_completed";
  read: boolean;
  createdAt: string;
}

export interface Complaint {
  id: string;
  userId: string;
  userName: string;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
}

/**
 * Public-facing seller profile shown on the customer "Nearby Sellers"
 * list. Distinct from a plain User so the customer module can show
 * location/distance/contact without leaking internal fields.
 */
export interface SellerProfile {
  sellerId: string;
  sellerName: string;
  businessName: string;
  location: string; // human-readable address
  distanceKm: number;
  phone: string;
  rating: number; // 0..5
  availableSizes: string[]; // e.g. ["6kg", "13kg", "22kg"]
  openNow: boolean;
  /**
   * Optional shop coordinates. When present the customer tracking
   * screen projects these onto the map and feeds them to the
   * delivery-tracking hook as `shopLatLng`. When absent the screen
   * falls back to a stable city-center default so the map still
   * renders. Backed by a future "edit shop" endpoint.
   */
  lat?: number;
  lng?: number;
  /**
   * Mirrors the backend `SellerProfileDto.region` / `.district` fields.
   * Populated by `GET /api/sellers` and `GET /api/sellers/me` so the
   * seller Profile screen can re-seed the "Region" / "District" inputs
   * on edit, and the admin surfaces can render an at-a-glance location
   * alongside the business name.
   */
  region?: string | null;
  district?: string | null;
  /**
   * Granular address fields mirroring the customer profile's
   * `ward` / `street`. Added in V12 so the Edit Business Address modal
   * can re-seed what the seller typed without losing granularity.
   */
  ward?: string | null;
  street?: string | null;
}

/**
 * Emergency contact surfaced on the Safety screen and the global
 * "CALL EMERGENCY" button.
 */
export interface EmergencyContact {
  id: string;
  label: string;
  number: string;
  icon: string;
}

// ----------------------------------------------------------------------
// Supplier logistics — routes, vehicles, riders, trips.
// ----------------------------------------------------------------------

/** ISO day-of-week label for fixed weekly delivery schedules. */
export type DeliveryDay =
  | "Mon"
  | "Tue"
  | "Wed"
  | "Thu"
  | "Fri"
  | "Sat"
  | "Sun";

/**
 * Per-seller progress along a trip. Mirrors the lifecycle described in the
 * product brief:
 *
 *   scheduled  → trip created, supplier hasn't left yet
 *   started    → trip started, supplier is en-route to this stop (or another)
 *   on_the_way → supplier has passed the previous stop and is heading here
 *   near_shop  → supplier is within the near-radius (default 500 m)
 *   delivered  → gas handed to this seller
 */
export type StopStatus =
  | "scheduled"
  | "started"
  | "on_the_way"
  | "near_shop"
  | "delivered";

/** Trip lifecycle for the Supplier module. */
export type TripStatus = "draft" | "started" | "in_transit" | "completed";

/** LatLng tuple shared with `src/lib/location.ts`. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * One scheduled stop on a `DeliveryRoute`. `sequence` defines order. The
 * `lat`/`lng` is used by the supplier live-map and the seller tracking
 * page to project the stop onto the route polyline.
 */
export interface RouteStop {
  sellerId: string;
  sellerName: string;
  /** Stable ordering along the route polyline. */
  sequence: number;
  address: string;
  lat: number;
  lng: number;
  status: StopStatus;
  /** ISO timestamp of the moment the supplier marked this stop delivered. */
  deliveredAt?: string;
}

/**
 * A recurring delivery route (e.g. "Tunguu", every Monday at 05:00). Holds
 * a polyline plus all the sellers the supplier visits on that route.
 */
export interface DeliveryRoute {
  id: string;
  name: string;
  scheduleDay: DeliveryDay;
  /** 24h "HH:MM" local time. */
  scheduleTime: string;
  stops: RouteStop[];
  /** Order matters — used by the live tracker to draw the planned path. */
  polyline: LatLng[];
  /** Optional administrative flag for deactivating without deleting. */
  active: boolean;
}

/** Vehicle used by the supplier for distribution. */
export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  capacityKg: number;
  active: boolean;
}

/** Rider/driver that operates the vehicle on a trip. */
export interface Rider {
  id: string;
  fullName: string;
  phone: string;
  licenseNo: string;
  active: boolean;
  /**
   * Identity fields surfaced by the rider self-service Profile screen
   * (backed by `rider_profiles` after the V6 migration). The dispatch
   * queue / admin views can keep ignoring them.
   */
  email?: string;
  username?: string;
  region?: string | null;
  district?: string | null;
  address?: string | null;
  nationalId?: string | null;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  vehicleModel?: string | null;
  available?: boolean;
  lat?: number | null;
  lng?: number | null;
}

/**
 * Read-only summary of the seller a rider is currently assigned to.
 * Returned by `GET /api/riders/me/assigned-seller`; the frontend reads
 * `null` to mean "the rider has not been assigned to a seller yet" and
 * surfaces the verbatim waiting message from the brief.
 */
export interface RiderAssignedSeller {
  sellerId: string;
  sellerName: string;
  businessName: string;
  phone: string;
  location: string;
  district: string | null;
  region: string | null;
}

/**
 * A teammate surfaced by `GET /api/riders/me/team` — one of the other
 * approved riders assigned to the same seller as the signed-in rider.
 * The signed-in rider's own row is flagged with `isMe = true` so the
 * My Team page can highlight it.
 */
export interface RiderTeamMember {
  id: string;
  fullName: string;
  phone: string | null;
  vehicleType: string | null;
  vehiclePlate: string | null;
  available: boolean;
  active: boolean;
  isMe: boolean;
}

/**
 * The "My Team" payload returned by `GET /api/riders/me/team`.
 * `seller` is null when the rider has not yet been assigned, in which
 * case `riders` is empty (we never leak riders from other sellers).
 */
export interface RiderTeam {
  seller: RiderAssignedSeller | null;
  riders: RiderTeamMember[];
}

/**
 * Minimal permit summary surfaced on the rider Profile screen.
 * Returned by `GET /api/riders/me/permit` (404 when no permit row
 * exists yet, so the frontend can render the "not yet issued" message).
 *
 * Extended by the Rider Verification workflow with `documents`,
 * `submittedAt`, `reviewedAt`, `reviewedByName`, `rejectionReason`
 * so the same DTO can power the Profile + the Verification section.
 */
export interface RiderPermitSummary {
  id: string;
  riderId: string;
  status: PermitStatus;
  certificateNumber: string | null;
  certificateUrl: string;
  issuedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  /**
   * Applicant's full name resolved from the `users` table by the
   * backend. Surfaced on the rider Profile / application summary card
   * so the rider sees their own name in the application details.
   */
  applicantName: string | null;
  rejectionReason: string | null;
  /** Uploaded documents (rider + admin view). Empty for unstarted applications. */
  documents: RiderApplicationDocument[];
}

/**
 * The PDF/image slot uploaded as part of the rider's verification
 * application. Mirrors the wire shape `RiderPermitDocumentDto` from the
 * backend. `downloadUrl` is a server-relative path the React Native
 * client appends to `API_CONFIG.BASE_URL` when streaming the bytes.
 */
export interface RiderApplicationDocument {
  id: string;
  documentType: RiderApplicationDocumentType;
  originalName: string | null;
  sizeBytes: number;
  contentType: string;
  uploadedAt: string;
  downloadUrl: string;
}

/** Slot keys the rider must fill before submission. */
export type RiderApplicationDocumentType =
  | "rider_application_form"
  | "rider_national_id"
  | "rider_driving_licence"
  | "rider_passport_photo"
  | "rider_vehicle_registration"
  | "rider_permit";

/**
 * The supplier's verification application. Mirrors the wire shape
 * `SupplierApplicationDto` from the backend, returned by
 * `GET /api/supplier-applications/me` (which lazy-creates a draft
 * PENDING row) and by the admin review queue.
 *
 * The `supplier*` fields are denormalised by the backend so the admin
 * review screen can render the applicant without a second lookup.
 *
 * `certificateUrl` only resolves once `status === "approved"` — the
 * endpoint returns HTTP 409 before that, which is what keeps the
 * certificate unavailable prior to approval.
 */
export interface SupplierApplication {
  id: string;
  supplierId: string;
  supplierName: string | null;
  supplierUsername: string | null;
  supplierEmail: string | null;
  supplierPhone: string | null;
  status: PermitStatus;
  certificateNumber: string | null;
  certificateUrl: string;
  issuedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  rejectionReason: string | null;
  /** Uploaded documents (supplier + admin view). Empty for unstarted applications. */
  documents: SupplierApplicationDocument[];
}

/**
 * The PDF/image slot uploaded as part of the supplier's verification
 * application. Mirrors the wire shape `SupplierApplicationDocumentDto`
 * from the backend. `downloadUrl` is a server-relative path the React
 * Native client appends to `API_CONFIG.BASE_URL` when streaming bytes.
 */
export interface SupplierApplicationDocument {
  id: string;
  documentType: SupplierApplicationDocumentType;
  originalName: string | null;
  sizeBytes: number;
  contentType: string;
  uploadedAt: string;
  downloadUrl: string;
}

/**
 * Slot keys the supplier must fill before submission. The trailing
 * `supplier_certificate` slot is admin-managed (generated on approval)
 * and is never uploadable by the supplier.
 */
export type SupplierApplicationDocumentType =
  | "supplier_application_form"
  | "supplier_national_id"
  | "supplier_business_registration"
  | "supplier_tin_certificate"
  | "supplier_business_licence"
  | "supplier_passport_photo"
  | "supplier_certificate";

/**
 * A live (or historical) delivery trip. Created by `startTrip()` and
 * advanced by `tickTrip()` while the supplier is on the road. Stops mirror
 * the route at trip-creation time so the trip has a stable in-memory
 * snapshot even when a route is later edited.
 */
export interface DeliveryTrip {
  id: string;
  supplierId: string;
  routeId: string;
  routeName: string;
  vehicleId: string;
  vehiclePlate: string;
  riderId: string;
  riderName: string;
  /** ISO date of the delivery (YYYY-MM-DD). */
  date: string;
  /** "HH:MM" local departure time. */
  departureTime: string;
  status: TripStatus;
  startedAt?: string;
  completedAt?: string;
  /** Live GPS trace — newest point last. */
  positions: LatLng[];
  /** Progress along the route polyline (0..1). */
  progress: number;
  /** Per-stop live state — snapshot of the route's stops at trip creation. */
  stops: RouteStop[];
}

/* ------------------------------------------------------------------ *
 * Admin module
 *
 * Wire shapes for the `/api/admin/**` endpoints. Every one of these is
 * a read-only projection the backend computes from live tables — see
 * `AdminReadService` on the Spring Boot side. They are deliberately
 * separate from the role-scoped types above (`User`, `Order`, …), which
 * carry only what a non-admin caller is allowed to see.
 * ------------------------------------------------------------------ */

/** Order headcount per lifecycle status. Keys match {@link OrderStatus}. */
export interface AdminOrderStatusCounts {
  pending: number;
  accepted: number;
  assigned: number;
  picked_up: number;
  in_transit: number;
  delivered: number;
  cancelled: number;
  rejected: number;
}

/** Every dashboard tile, from `GET /api/admin/stats`. */
export interface AdminStats {
  totalUsers: number;
  totalCustomers: number;
  totalSellers: number;
  totalRiders: number;
  totalSuppliers: number;
  totalAdmins: number;
  totalProducts: number;
  totalOrders: number;
  orderStatus: AdminOrderStatusCounts;
  /** Orders still moving: pending through in-transit. */
  activeOrders: number;
  pendingSellerApplications: number;
  underReviewSellerApplications: number;
  approvedSellers: number;
  rejectedSellerApplications: number;
  totalNotifications: number;
  /** Sum of totals across delivered orders. */
  revenueDelivered: number;
  generatedAt: string;
}

/** A row of the admin user directory, from `GET /api/admin/users`. */
export interface AdminUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A customer with lifetime aggregates, from `GET /api/admin/customers`. */
export interface AdminCustomer {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
}

/**
 * A seller with business profile, permit state and catalogue size, from
 * `GET /api/admin/sellers`. `permitStatus` is null for sellers that
 * predate the permit flow and have no application row.
 */
export interface AdminSeller {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  businessName: string | null;
  address: string | null;
  district: string | null;
  region: string | null;
  /** Ward / street — added on the backend in V12 so the admin directory
   *  reflects what the seller typed, not just Region + District. */
  ward: string | null;
  street: string | null;
  rating: number | null;
  openNow: boolean | null;
  lat: number | null;
  lng: number | null;
  permitStatus: PermitStatus | null;
  permitSubmittedAt: string | null;
  permitReviewedAt: string | null;
  rejectionReason: string | null;
  productCount: number;
}

/**
 * A rider with vehicle details and workload, from `GET /api/admin/riders`.
 * `lat`/`lng` are the coordinates on the rider's profile, not a live
 * position — live tracking is a WebSocket stream and isn't persisted.
 */
export interface AdminRider {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  vehicleType: string | null;
  vehiclePlate: string | null;
  vehicleModel: string | null;
  licenseNo: string | null;
  available: boolean;
  lat: number | null;
  lng: number | null;
  /** Orders currently in this rider's hands (assigned → in transit). */
  assignedOrders: number;
  completedDeliveries: number;
  assignedSellers: number;
}

/** A catalogue row, from `GET /api/admin/products`. Includes inactive rows. */
export interface AdminProduct {
  id: string;
  sellerId: string;
  sellerName: string | null;
  name: string;
  size: string;
  price: number;
  stock: number;
  category: string | null;
  description: string | null;
  image: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** An order row for the admin order book, from `GET /api/admin/orders`. */
export interface AdminOrder {
  id: string;
  customerId: string;
  customerName: string;
  sellerId: string;
  sellerName: string;
  riderId: string | null;
  riderName: string | null;
  status: OrderStatus;
  total: number;
  itemCount: number;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  phone: string | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A notification with its recipient resolved, from `GET /api/admin/notifications`. */
export interface AdminNotification {
  id: string;
  userId: string;
  userName: string | null;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

/** A seller↔rider pairing, from `GET /api/admin/assignments`. */
export interface AdminAssignment {
  sellerId: string;
  sellerName: string | null;
  businessName: string | null;
  riderId: string;
  riderName: string | null;
  riderAvailable: boolean;
  assignedAt: string;
}

/** Order and revenue statistics over a window, from `GET /api/admin/reports`. */
export interface AdminReport {
  from: string;
  to: string;
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  rejectedOrders: number;
  revenue: number;
  averageOrderValue: number;
  ordersByDay: { date: string; orders: number; revenue: number }[];
  topSellers: {
    sellerId: string;
    sellerName: string | null;
    orders: number;
    revenue: number;
  }[];
  statusBreakdown: AdminOrderStatusCounts;
}
