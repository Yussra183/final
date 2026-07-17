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

export type PermitStatus = "draft" | "pending" | "approved" | "rejected";

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
  documents: string[]; // document names
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
