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
   * Customer-profile location. Optional today; when present it will be
   * used by the home-screen "Nearby Sellers" pipeline to scope the
   * recommendation list. Once GPS is wired up, `lat` / `lng` will take
   * precedence over the textual `address` for distance sorting.
   */
  address?: string;
  district?: string;
  region?: string;
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
}

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
