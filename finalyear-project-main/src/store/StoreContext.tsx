import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AuthSession,
  Complaint,
  EmergencyContact,
  GasProduct,
  NotificationItem,
  Order,
  OrderStatus,
  PermitApplication,
  PermitDocument,
  PermitStatus,
  RestockRequest,
  SellerPermit,
  SellerProfile,
  User,
  UserRole,
  DeliveryRoute,
  Vehicle,
  Rider,
  DeliveryTrip,
  LatLng,
  RouteStop,
  RiderPermitSummary,
  SupplierApplication,
  SupplierApplicationDocumentType,
  CustomerLocation,
} from "../../constants/types";
import { API_CONFIG } from "../api/config";
import { setTokenProvider, ApiError } from "../api";
import {
  AdminRiderPermitsApi,
  AdminSupplierApplicationsApi,
  AuthApi,
  ComplaintsApi,
  CustomersApi,
  NotificationsApi,
  OrdersApi,
  PermitsApi,
  ProductsApi,
  RestockApi,
  RiderPermitsApi,
  RidersApi,
  RoutesApi,
  SellersApi,
  SupplierApplicationsApi,
  UsersApi,
  VehiclesApi,
} from "../api/endpoints";
import { orderService } from "../services/OrderService";
import type { CreateOrderDto } from "../services/OrderService";
import { OrderServiceError } from "../services/orderErrors";
import {
  fanOutLocalNotifications,
  requestNotificationPermission,
  scheduleLocalNotification,
} from "../lib/notifications";
import { haversineMeters, pointAtProgress } from "../lib/location";
// NOTE: the in-memory `sellersForRider` / `seededSellerRiders` from
// `lib/riderMatching` were removed alongside the demo seed data. The
// rider dispatch flow now goes through the backend's `seller_riders`
// table and OrderService broadcasts eligible riders server-side.

interface StoreShape {
  // Auth
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
  /**
   * Stable error code from the most recent failed action, e.g.
   * `BAD_CREDENTIALS`, `ACCOUNT_PENDING_APPROVAL`, `ACCOUNT_REJECTED`,
   * `NETWORK`, `TIMEOUT`. Lets screens branch on the failure type
   * (e.g. show a "waiting for admin approval" alert for sellers) without
   * having to parse the free-form `error` message.
   */
  errorCode: string | null;
  /** True when the store is reading from the in-memory mock; false when hitting the API. */
  usingMock: boolean;
  login: (username: string, password: string) => Promise<User | null>;
  register: (input: RegisterInput) => Promise<User | null>;
  logout: () => void;
  refresh: () => Promise<void>;

  // Data
  users: User[];
  products: GasProduct[];
  orders: Order[];
  restockRequests: RestockRequest[];
  permits: PermitApplication[];
  /**
   * Live-API permits keyed by seller id. The legacy `permits` slice above
   * is kept for the mock branch and the admin reviewer screen; the seller
   * profile screen reads `sellerPermits[me.id]` for the new server-side
   * flow.
   */
  sellerPermits: Record<string, SellerPermit>;
  /**
   * Live-API rider verification applications keyed by rider id. The
   * rider-facing Profile / Verification section reads
   * `riderPermits[me.id]` for the new server-side flow.
   */
  riderPermits: Record<string, RiderPermitSummary>;
  /**
   * Live-API supplier verification applications keyed by supplier id.
   * The supplier-facing Verification / Profile screens read
   * `supplierApplications[me.id]` for the server-side flow.
   */
  supplierApplications: Record<string, SupplierApplication>;
  notifications: NotificationItem[];
  complaints: Complaint[];
  sellers: SellerProfile[];
  emergencyContacts: EmergencyContact[];

  // Supplier logistics
  routes: DeliveryRoute[];
  vehicles: Vehicle[];
  riders: Rider[];
  trips: DeliveryTrip[];

  // Helpers
  getUser: (id: string) => User | undefined;
  getProductsForSeller: (sellerId: string) => GasProduct[];
  getOrdersForUser: (userId: string, role: UserRole) => Order[];
  getRestockForSupplier: (supplierId: string) => RestockRequest[];
  getRestockForSeller: (sellerId: string) => RestockRequest[];
  getPermitForSeller: (sellerId: string) => PermitApplication | undefined;
  getNotificationsForUser: (userId: string) => NotificationItem[];
  getRoute: (id: string) => DeliveryRoute | undefined;
  getTrip: (id: string) => DeliveryTrip | undefined;
  getActiveTripForSupplier: (supplierId: string) => DeliveryTrip | undefined;
  getTripsForSupplier: (supplierId: string) => DeliveryTrip[];

  // Actions
  placeOrder: (input: PlaceOrderInput) => Promise<Order>;
  /**
   * Seller accepts a PENDING order. Transitions to ACCEPTED and fans
   * the order out to nearby eligible riders.
   */
  acceptOrder: (orderId: string) => Promise<void>;
  /**
   * Seller rejects a PENDING order with an optional reason. Transitions
   * to REJECTED and notifies the customer.
   */
  rejectOrder: (orderId: string, reason?: string) => Promise<void>;
  /**
   * Customer cancels a PENDING order before the seller acts.
   */
  cancelOrder: (orderId: string, reason?: string) => Promise<void>;
  /**
   * Rider self-assigns an ACCEPTED order. Atomic — throws RIDER_BUSY
   * if another rider won the race.
   */
  claimOrder: (orderId: string) => Promise<void>;
  /**
   * Rider advances delivery. `next` must be the next legal status in
   * the order's lifecycle — anything else throws INVALID_TRANSITION.
   */
  advanceDelivery: (
    orderId: string,
    next: "picked_up" | "in_transit" | "delivered",
  ) => Promise<void>;
  /** Orders currently eligible for this user to claim. */
  availableOrdersForUser: () => Order[];
  /** Legacy verbs kept for screens still on the in-memory mock. */
  updateOrderStatus: (
    orderId: string,
    status: OrderStatus,
    riderId?: string,
  ) => Promise<void>;
  assignRider: (
    orderId: string,
    riderId: string,
    riderName: string,
  ) => Promise<void>;
  addProduct: (p: Omit<GasProduct, "id">) => Promise<void>;
  updateProductStock: (productId: string, stock: number) => Promise<void>;
  requestRestock: (
    r: Omit<RestockRequest, "id" | "createdAt" | "status">,
  ) => Promise<void>;
  updateRestockStatus: (
    id: string,
    status: RestockRequest["status"],
  ) => Promise<void>;
  submitPermit: (
    p: Omit<PermitApplication, "id" | "submittedAt" | "status">,
  ) => Promise<void>;
  reviewPermit: (
    id: string,
    status: PermitStatus,
    note?: string,
  ) => Promise<void>;

  // ---- Seller permit verification (live API) ---------------------------
  /** Re-fetch the signed-in seller's permit and store it under `sellerPermits[me.id]`. */
  fetchMyPermit: () => Promise<SellerPermit | null>;
  /**
   * Upload one PDF or image (application_form / national_id /
   * business_license / passport_photo). The `file` argument may be
   * either a real `Blob` (Expo `File` subclass) or a
   * `{ uri, name, type }` triple — React Native accepts both as the
   * second argument of `FormData.append`. The tuple form is preferred
   * on the seller side because it survives every RN FormData release.
   */
  uploadPermitDocument: (
    type: Exclude<PermitDocument["documentType"], "license">,
    file: Blob | { uri: string; name: string; type?: string },
    filename: string,
  ) => Promise<PermitDocument>;
  /** Remove a previously-uploaded PDF (only before submission). */
  deletePermitDocument: (documentId: string) => Promise<void>;
  /** Finalise the application — requires all three seller documents. */
  submitMyPermit: (businessName: string) => Promise<SellerPermit>;
  /** Fetch the admin queue. Replaces the local-only mocks for admins. */
  fetchAdminPermits: (status?: PermitStatus) => Promise<SellerPermit[]>;
  /** Approve a permit and (optionally) upload a licence PDF in one call. */
  approveAdminPermit: (
    permitId: string,
    license?: { blob: Blob; filename: string },
  ) => Promise<SellerPermit>;
  /** Reject a permit with a seller-facing reason. */
  rejectAdminPermit: (permitId: string, reason: string) => Promise<SellerPermit>;

  // ---- Rider verification (live API) -----------------------------------
  /**
   * Re-fetch the signed-in rider's verification application (lazy-creates
   * a draft PENDING row on first call) and store it under
   * `riderPermits[me.id]`.
   */
  fetchMyRiderApplication: () => Promise<RiderPermitSummary | null>;
  /**
   * Upload one PDF or image for one of the rider verification slots
   * (`rider_application_form | rider_national_id | rider_driving_licence
   * | rider_passport_photo | rider_vehicle_registration`). Replaces any
   * prior row for the slot on the server side.
   */
  uploadRiderApplicationDocument: (
    type: Exclude<
      RiderPermitSummary["documents"][number]["documentType"],
      "rider_permit"
    >,
    file: Blob | { uri: string; name: string; type?: string },
    filename: string,
  ) => Promise<RiderPermitSummary["documents"][number]>;
  /** Remove a previously-uploaded rider document (only before submission). */
  deleteRiderApplicationDocument: (documentId: string) => Promise<void>;
  /** Finalise the rider application — requires all 5 required documents. */
  submitRiderApplication: () => Promise<RiderPermitSummary>;
  /** Fetch the admin queue of rider applications. */
  fetchAdminRiderApplications: (
    status?: PermitStatus,
  ) => Promise<RiderPermitSummary[]>;
  /** Approve a rider application (JSON; no file body). */
  approveAdminRiderApplication: (
    applicationId: string,
  ) => Promise<RiderPermitSummary>;
  /** Reject a rider application with a rider-facing reason. */
  rejectAdminRiderApplication: (
    applicationId: string,
    reason: string,
  ) => Promise<RiderPermitSummary>;

  // ---- Supplier verification (live API) --------------------------------
  /**
   * Re-fetch the signed-in supplier's verification application
   * (lazy-creates a draft PENDING row on first call) and store it under
   * `supplierApplications[me.id]`.
   */
  fetchMySupplierApplication: () => Promise<SupplierApplication | null>;
  /**
   * Upload one PDF or image for one of the supplier verification slots
   * (`supplier_application_form | supplier_national_id |
   * supplier_business_registration | supplier_tin_certificate |
   * supplier_business_licence | supplier_passport_photo`). Replaces any
   * prior row for the slot on the server side.
   */
  uploadSupplierApplicationDocument: (
    type: Exclude<SupplierApplicationDocumentType, "supplier_certificate">,
    file: Blob | { uri: string; name: string; type?: string },
    filename: string,
  ) => Promise<void>;
  /** Remove a previously-uploaded supplier document (only before submission). */
  deleteSupplierApplicationDocument: (documentId: string) => Promise<void>;
  /** Finalise the supplier application — requires all 6 required documents. */
  submitSupplierApplication: () => Promise<SupplierApplication>;
  /** Fetch the admin queue of supplier applications. */
  fetchAdminSupplierApplications: (
    status?: PermitStatus,
  ) => Promise<SupplierApplication[]>;
  /** Approve a supplier application (JSON; no file body). */
  approveAdminSupplierApplication: (
    applicationId: string,
  ) => Promise<SupplierApplication>;
  /** Reject a supplier application with a supplier-facing reason. */
  rejectAdminSupplierApplication: (
    applicationId: string,
    reason: string,
  ) => Promise<SupplierApplication>;
  markNotificationRead: (id: string) => Promise<void>;
  /**
   * Bulk-mark every notification for the supplied user id (defaults
   * to the signed-in user) as read. Used by the Seller Notifications
   * screen on mount to clear the dashboard badge.
   */
  markAllNotificationsRead: (userId?: string) => Promise<void>;
  addComplaint: (
    c: Omit<Complaint, "id" | "createdAt" | "status">,
  ) => Promise<void>;
  resolveComplaint: (id: string) => Promise<void>;
  updateUserStatus: (id: string, active: boolean) => Promise<void>;

  // Supplier logistics actions
  startTrip: (input: StartTripInput) => Promise<DeliveryTrip>;
  tickTrip: (tripId: string, deltaProgress?: number) => DeliveryTrip | null;
  markStopDelivered: (tripId: string, sellerId: string) => void;
  createRoute: (input: Omit<DeliveryRoute, "id" | "polyline"> & { polyline?: LatLng[] }) => Promise<DeliveryRoute>;
  toggleRouteActive: (id: string, active: boolean) => void;
  addVehicle: (input: Omit<Vehicle, "id">) => Promise<Vehicle>;
  toggleVehicleActive: (id: string, active: boolean) => void;
  addRider: (input: Omit<Rider, "id">) => Promise<Rider>;
  toggleRiderActive: (id: string, active: boolean) => void;

  /**
   * Update the signed-in user's profile (name, phone, email, and the
   * full location tuple). When the location fields change, the home
   * screen's "Nearby Sellers" pipeline re-derives its list automatically
   * because `useNearbySellers` reads them off the same store. The
   * personal fields (fullName / username / email / phone) ride along on
   * `PATCH /api/customers/me`; the location tuple rides along on
   * `PUT /api/customers/me` via the dedicated `saveCustomerLocation`
   * action. Both sit behind the same customer-role guard on the
   * backend.
   */
  updateProfile: (patch: Partial<Omit<User, "id" | "role" | "createdAt">>) => Promise<void>;

  /**
   * Persist the signed-in customer's location to `customer_profiles`
   * via `PUT /api/customers/me`, then merge the server's response onto
   * `session.user`.
   *
   * The response — not the patch — is what gets merged, because the
   * backend derives `lat` / `lng` by geocoding the address. Those
   * coordinates are what `useNearbySellers` needs in order to query
   * `GET /api/sellers?lat&lng&radiusKm`, so the nearby list refreshes
   * as soon as this resolves.
   *
   * This is the only thing that invalidates the session-cached
   * location; it is otherwise loaded once, after login.
   */
  saveCustomerLocation: (patch: CustomerLocation) => Promise<void>;

  /**
   * Persist the signed-in seller's business address to
   * `seller_profiles` via `POST /api/sellers/me`. Mirrors the customer
   * `saveCustomerLocation` action so the seller Profile screen has a
   * parallel "edit business address" flow. SELLER-role only.
   *
   * The seller is NEVER exposed to latitude / longitude — the action
   * simply forwards the typed address; the backend's `GeocodingService`
   * supplies the coordinates and the response carries them back, which
   * the implementation merges onto `session.user`. Editing the address
   * automatically recalculates coordinates on every save.
   *
   * `deviceCoords`, when provided, overrides the server-side geocode
   * with the device's GPS fix — the seller never sees the value but it
   * gives the saved row exact coordinates when permission is granted.
   */
  saveSellerLocation: (patch: {
    businessName?: string;
    location: string;
    phone?: string;
    region?: string | null;
    district?: string | null;
    deviceCoords?: { lat: number; lng: number } | null;
  }) => Promise<void>;
}

export interface RegisterInput {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
  /**
   * Optional seller business address captured during registration.
   * When the new account is a SELLER and any of these fields are
   * supplied, the store follows the successful registration with a
   * `POST /api/sellers/me` upsert so the business address is persisted
   * alongside the user record. Latitude / longitude are NEVER accepted
   * here — the device-GPS / backend-geocode layer fills them in so the
   * seller never has to know a coordinate. For non-seller roles these
   * fields are silently ignored.
   */
  businessName?: string;
  businessRegion?: string;
  businessDistrict?: string;
  businessWard?: string;
  businessStreet?: string;
  businessAddress?: string;
  /**
   * Optional device-derived coordinates captured at registration time.
   * When non-null the store forwards them to the backend so the
   * address is persisted with the GPS fix; when null the backend
   * geocodes the typed address. Either way the seller never sees or
   * types a coordinate.
   */
  businessLat?: number | null;
  businessLng?: number | null;
}

export interface PlaceOrderInput {
  customerId: string;
  customerName: string;
  sellerId: string;
  sellerName: string;
  items: Order["items"];
  total: number;
  /** Customer-supplied phone for THIS delivery — required. */
  phone: string;
  deliveryLocation: Order["deliveryLocation"];
  notes?: string;
}

/** Input to `startTrip` — picked on the Start Delivery screen. */
export interface StartTripInput {
  routeId: string;
  vehicleId: string;
  riderId: string;
  date: string; // ISO date "YYYY-MM-DD"
  departureTime: string; // "HH:MM"
}

/** Distance threshold (meters) for the "near your shop" notification. */
export const NEAR_RADIUS_METERS = 500;

const StoreContext = createContext<StoreShape | undefined>(undefined);

// Auth runs through the live Spring Boot backend. USE_MOCK is `false` in
// src/api/config.ts; the constants below are kept only so the existing
// `login` / `register` guards (which short-circuit when USE_MOCK is
// flipped on for offline development) don't reference missing symbols.
const USE_MOCK = API_CONFIG.USE_MOCK;

/**
 * Merge a `CustomerLocation` payload from `/api/customers/me` onto a
 * `User`, normalising the wire's `null`s into `undefined`.
 *
 * The distinction matters: the backend returns explicit `null` for a
 * field the customer has never filled in, but `User` declares those
 * fields as optional (`string | undefined`). Passing the raw `null`
 * through would make `typeof user.lat === "number"` false in a way
 * that's correct, yet leave `user.region` rendering as the string
 * "null" in an input. Normalising once, here, keeps every consumer
 * simple.
 */
function mergeCustomerLocation(user: User, location: CustomerLocation): User {
  const text = (v: string | null | undefined): string | undefined =>
    v === null || v === undefined || v === "" ? undefined : v;
  const num = (v: number | null | undefined): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;

  return {
    ...user,
    region: text(location.region),
    district: text(location.district),
    ward: text(location.ward),
    street: text(location.street),
    address: text(location.address),
    lat: num(location.lat),
    lng: num(location.lng),
  };
}

/**
 * Wraps a Promise-returning action with loading + error bookkeeping
 * so the UI can show spinners and surface server messages.
 *
 * Returns `{ data, error }` — `data` is the success payload (or `null`
 * on failure), and `error` is the human-readable message for the failure
 * case. Callers should read `error` from the return value rather than
 * the closed-over `error` state, which can be one render behind.
 */
export interface AsyncResult<T> {
  data: T | null;
  error: string | null;
  /**
   * Stable error code (e.g. `BAD_CREDENTIALS`, `ACCOUNT_PENDING_APPROVAL`,
   * `ACCOUNT_REJECTED`, `NETWORK`, `TIMEOUT`) lifted from the underlying
   * `ApiError`. Screens can branch on this without having to parse the
   * human-readable message.
   */
  errorCode: string | null;
}

function useAsync(
  setLoading: (b: boolean) => void,
  setError: (s: string | null) => void,
  setErrorCode: (s: string | null) => void,
) {
  return useCallback(
    async <T,>(fn: () => Promise<T>): Promise<AsyncResult<T>> => {
      setLoading(true);
      setError(null);
      setErrorCode(null);
      try {
        const data = await fn();
        return { data, error: null, errorCode: null };
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : (err as Error)?.message ?? "Something went wrong";
        const code = err instanceof ApiError ? err.code ?? null : null;
        setError(msg);
        setErrorCode(code);
        return { data: null, error: msg, errorCode: code };
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError, setErrorCode],
  );
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // The store starts empty — `refresh()` (run once on session change
  // and re-run on login) loads every list from the backend. There is
  // no in-memory seed fallback: only data created through the
  // application should ever appear in the UI.
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<GasProduct[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [restockRequests, setRestockRequests] = useState<RestockRequest[]>([]);
  const [permits, setPermits] = useState<PermitApplication[]>([]);
  /**
   * Live-API permits keyed by seller id. Empty in mock mode — the mock
   * branch keeps using `permits` for backwards compatibility.
   */
  const [sellerPermits, setSellerPermits] = useState<Record<string, SellerPermit>>({});
  const [riderPermits, setRiderPermits] = useState<Record<string, RiderPermitSummary>>({});
  const [supplierApplications, setSupplierApplications] = useState<
    Record<string, SupplierApplication>
  >({});
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [sellers, setSellers] = useState<SellerProfile[]>([]);
  const [emergencyContacts] = useState<EmergencyContact[]>([]);
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [trips, setTrips] = useState<DeliveryTrip[]>([]);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);
  const refreshSequenceRef = useRef(0);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Bind the API token provider to the current session.
  useEffect(() => {
    setTokenProvider(() => session?.token ?? null);
  }, [session]);

  // ---- Bootstrap from API on mount (non-mock only) ---------------------
  /**
   * Pull the full dataset from the backend. Each endpoint is fetched
   * independently via `Promise.allSettled` — a single 500 from one
   * endpoint (e.g. a not-yet-implemented module) does not poison the
   * others, and the user keeps the lists that DID succeed.
   *
   * Sellers, products, and riders all load from the backend when
   * USE_MOCK is false. The customer home / product list / rider
   * dispatch queue re-render reactively from this state.
   *
   * Surfacing partial errors: if any of the 9 endpoints timed out or
   * failed, we set `error` to a short, non-blocking message so the
   * UI can render a banner ("couldn't refresh orders — tap to retry")
   * without throwing. Callers therefore still get a partially-populated
   * store instead of an empty one.
   */
  const refresh = useCallback(async () => {
    if (USE_MOCK) {
      // The store starts empty; mock mode is not configured here. The
      // auth flow doesn't need any slice to render.
      setError(null);
      return;
    }

    const currentSession = sessionRef.current;
    if (!currentSession?.token?.trim()) {
      // Logged out — clear any stale data and exit. The auth flow
      // itself doesn't depend on these slices.
      setError(null);
      return;
    }

    const refreshId = ++refreshSequenceRef.current;
    const actorAtStart = currentSession.user;
    if (__DEV__) {
      console.info(
        "[RIDER_ORDERS][REFRESH_START]",
        JSON.stringify({
          refreshId,
          hasSession: !!actorAtStart,
          actorId: actorAtStart?.id ?? null,
          actorRole: actorAtStart?.role ?? null,
        }),
      );
    }

    const results = await Promise.allSettled([
      UsersApi.list(),
      ProductsApi.list(),
      OrdersApi.list(),
      SellersApi.list(),
      RidersApi.list(),
      RestockApi.list(),
      PermitsApi.list(),
      NotificationsApi.list(),
      ComplaintsApi.list(),
    ]);
    const value = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
      r.status === "fulfilled" ? r.value : fallback;
    setUsers(value(results[0], []));
    setProducts(value(results[1], []));

    // Supplier logistics: routes and vehicles are scoped server-side to
    // the signed-in supplier. Only fetch them when the actor is a
    // supplier so other roles don't see 403 noise from the new module.
    if (actorAtStart?.role === "supplier") {
      const [routesResult, vehiclesResult] = await Promise.allSettled([
        RoutesApi.list(),
        VehiclesApi.list(),
      ]);
      setRoutes(
        routesResult.status === "fulfilled" ? routesResult.value : [],
      );
      setVehicles(
        vehiclesResult.status === "fulfilled" ? vehiclesResult.value : [],
      );
    } else {
      setRoutes([]);
      setVehicles([]);
    }

    const orderResult = results[2];
    const nextOrders = value(orderResult, []);
    if (__DEV__) {
      const rejection =
        orderResult.status === "rejected"
          ? orderResult.reason instanceof ApiError
            ? {
                message: orderResult.reason.message,
                status: orderResult.reason.status,
                code: orderResult.reason.code ?? null,
              }
            : {
                message:
                  (orderResult.reason as Error)?.message ??
                  String(orderResult.reason),
              }
          : null;
      console.info(
        "[RIDER_ORDERS][REFRESH_SET_ORDERS]",
        JSON.stringify({
          refreshId,
          hasSessionAtStart: !!actorAtStart,
          actorIdAtStart: actorAtStart?.id ?? null,
          actorRoleAtStart: actorAtStart?.role ?? null,
          fulfilled: orderResult.status === "fulfilled",
          backendOrderCount:
            orderResult.status === "fulfilled" && Array.isArray(orderResult.value)
              ? orderResult.value.length
              : null,
          nextStateCount: nextOrders.length,
          nextStateIds: nextOrders.map((order) => order.id),
          rejection,
        }),
      );
    }
    // Merge server rows with any locally-optimistic rows that haven't
    // round-tripped yet. A "recent" row (placed in the last 60 s) that's
    // missing from the server response is almost certainly a propagation
    // race — keep it on screen rather than silently dropping it. Older
    // rows that don't match the server are dropped so the API stays the
    // source of truth.
    setOrders((prev) => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const cutoff = Date.now() - 60_000;
      const serverIds = new Set(nextOrders.map((o) => o.id));
      const optimistic = safePrev.filter((o) => {
        const ts = o.updatedAt ?? o.createdAt;
        if (!ts) return false;
        const age = Date.now() - new Date(ts).getTime();
        return age < 60_000 && !serverIds.has(o.id);
      });
      const merged = [...optimistic, ...nextOrders];
      return merged.slice().sort(sortByUpdatedDesc);
    });

    setSellers(value(results[3], []));
    setRiders(value(results[4], []));
    setRestockRequests(value(results[5], []));
    setPermits(value(results[6], []));
    setNotifications(value(results[7], []));
    setComplaints(value(results[8], []));

    // Seller / admin permit bootstrapping (live API only).
    // We don't make this part of the parallel `Promise.allSettled` above
    // because the right call depends on the actor role — and so that a
    // failure here doesn't taint the main 9-endpoint refresh set.
    if (actorAtStart?.role === "seller") {
      try {
        const permit = await PermitsApi.myPermit();
        if (permit) {
          setSellerPermits((prev) => ({ ...prev, [permit.sellerId]: permit }));
          // Mirror the latest status onto session.user for the layout banner.
          setSession((prev) =>
            prev && prev.user.id === permit.sellerId
              ? {
                  ...prev,
                  user: {
                    ...prev.user,
                    permitStatus: permit.status,
                    isActive: permit.status === "approved",
                  },
                }
              : prev,
          );
        }
      } catch (err) {
        if (__DEV__) {
          console.warn(
            "[PERMITS][REFRESH_MY_PERMIT_FAILED]",
            (err as Error)?.message,
          );
        }
      }

      // Seller business address bootstrap. The row lives on
      // `seller_profiles` (the table `GET /api/sellers?lat&lng` reads
      // to populate the customer "Nearby Sellers" list). A seller who
      // hasn't completed the business-address step yet throws 404 — we
      // swallow that branch and let the Profile screen surface the
      // empty state. Successfully fetched rows are mirrored onto
      // `session.user` so the Profile "Business Address" field shows
      // the persisted value right after login / app restart.
      try {
        const sellerProfile = await SellersApi.me();
        if (sellerProfile) {
          setSession((prev) =>
            prev && prev.user.id === String(sellerProfile.sellerId)
              ? {
                  ...prev,
                  user: {
                    ...prev.user,
                    address: sellerProfile.location || prev.user.address,
                    district:
                      sellerProfile.district ?? prev.user.district,
                    region: sellerProfile.region ?? prev.user.region,
                    lat: typeof sellerProfile.lat === "number"
                      ? sellerProfile.lat
                      : prev.user.lat,
                    lng: typeof sellerProfile.lng === "number"
                      ? sellerProfile.lng
                      : prev.user.lng,
                  },
                }
              : prev,
          );
        }
      } catch (err) {
        // 404 here == seller has not created a profile yet. Anything
        // else is unexpected but non-fatal: the Profile screen
        // still renders; the seller can re-save the address from
        // there.
        if (__DEV__) {
          console.warn(
            "[SELLERS][REFRESH_MY_PROFILE_FAILED]",
            (err as Error)?.message,
          );
        }
      }
    }

    // Customer location bootstrapping (live API only).
    //
    // The customer's saved location lives in `customer_profiles`, not on
    // the `users` row, so it does not ride along on the login response.
    // Fetch it once here and merge it onto `session.user` — that single
    // read is what makes the Profile screen show the saved address after
    // a fresh login / app restart, and what gives `useNearbySellers` the
    // coordinates it needs to query the nearby endpoint.
    //
    // Kept out of the parallel `Promise.allSettled` above for the same
    // reason as the seller branch: the right call depends on the actor's
    // role, and a failure here must not taint the main refresh set.
    if (actorAtStart?.role === "customer") {
      try {
        const location = await CustomersApi.myLocation();
        if (location) {
          setSession((prev) =>
            prev && prev.user.id === actorAtStart.id
              ? { ...prev, user: mergeCustomerLocation(prev.user, location) }
              : prev,
          );
        }
      } catch (err) {
        // A customer who has never saved a location still gets a 200
        // with null fields, so this only fires on a real network /
        // server failure. Non-fatal: the Profile screen renders empty
        // inputs and the home screen falls back to its default list.
        if (__DEV__) {
          console.warn(
            "[CUSTOMER_LOCATION][REFRESH_FAILED]",
            (err as Error)?.message,
          );
        }
      }
    }

    // Surface partial failures so the UI can show a retry banner. We
    // only mention the FIRST failure to avoid spammy toasts; the
    // remaining failures are still recoverable on the next refresh.
    const firstFailure = (results as PromiseSettledResult<unknown>[])
      .map((r) =>
        r.status === "rejected"
          ? r.reason instanceof ApiError
            ? r.reason.message
            : ((r.reason as Error)?.message ?? String(r.reason))
          : null,
      )
      .find((m): m is string => !!m && m.length > 0);
    if (firstFailure) {
      setError(`Couldn't refresh data: ${firstFailure}`);
    } else {
      setError(null);
    }

    if (__DEV__) {
      console.info(
        "[RIDER_ORDERS][REFRESH_FINISH]",
        JSON.stringify({
          refreshId,
          currentRefreshId: refreshSequenceRef.current,
          hasSessionNow: !!sessionRef.current,
          actorIdNow: sessionRef.current?.user.id ?? null,
          actorRoleNow: sessionRef.current?.user.role ?? null,
        }),
      );
    }
  }, []);

  // Synchronize API-backed state with authentication. Without a token,
  // refresh() clears local API data and exits before issuing any request;
  // after login, the token-provider effect above has already installed the
  // bearer token used by every endpoint in the refresh.
  useEffect(() => {
    if (USE_MOCK) return;
    refresh().catch((err) => {
      setError(`Couldn't refresh data: ${(err as Error)?.message ?? "unknown error"}`);
    });
  }, [session, refresh]);

  // ---- Async wrapper ---------------------------------------------------
  const run = useAsync(setLoading, setError, setErrorCode);

  // ---- Auth ------------------------------------------------------------
  const login = useCallback(
    async (username: string, password: string): Promise<User | null> => {
      const { data } = await run(async () => {
        if (USE_MOCK) {
          throw new Error(
            "Mock authentication is disabled. Sign in through the live API.",
          );
        }
        const { user, token } = await AuthApi.login({ identifier: username, password });
        setSession({ user, token });
        return user;
      });
      return data;
    },
    [run],
  );

  const register = useCallback(
    async (input: RegisterInput): Promise<User | null> => {
      const { data } = await run(async () => {
        if (USE_MOCK) {
          throw new Error(
            "Mock registration is disabled. Register through the live API.",
          );
        }
        // Strip the optional seller business address out of the
        // auth/register payload — the auth endpoint only accepts the
        // base identity fields per the backend's RegisterRequest.
        const { user, token } = await AuthApi.register({
          fullName: input.fullName,
          username: input.username,
          email: input.email,
          phone: input.phone,
          password: input.password,
          role: input.role,
        });
        setSession({ user, token });
        // For SELLER registrations with a captured business address,
        // follow up with the seller-profile upsert so the address
        // lives on `seller_profiles` (the table the customer "Nearby
        // Sellers" pipeline filters against). The profile upsert is a
        // best-effort follow-on: a geocoding failure here must not
        // un-create the account we just made.
        if (input.role === "seller") {
          const hasAnyAddressField =
            input.businessName ||
            input.businessAddress ||
            input.businessRegion ||
            input.businessDistrict ||
            input.businessWard ||
            input.businessStreet;
          if (hasAnyAddressField) {
            try {
              await SellersApi.updateMe({
                businessName: input.businessName ?? input.fullName,
                location:
                  input.businessAddress ??
                  [
                    input.businessStreet,
                    input.businessWard,
                    input.businessDistrict,
                    input.businessRegion,
                  ]
                    .filter(Boolean)
                    .join(", "),
                phone: input.phone,
                region: input.businessRegion ?? undefined,
                district: input.businessDistrict ?? undefined,
                lat:
                  typeof input.businessLat === "number"
                    ? input.businessLat
                    : undefined,
                lng:
                  typeof input.businessLng === "number"
                    ? input.businessLng
                    : undefined,
              });
            } catch (err) {
              // Persist the registration regardless — the seller can
              // complete the business address from their Profile
              // screen once logged in. Logging only keeps the
              // registration alert clean while still surfacing the
              // issue for development.
              console.warn(
                "[register] seller-profile upsert failed:",
                (err as Error)?.message,
              );
            }
          }
        }
        return user;
      });
      return data;
    },
    [run],
  );

  const logout = useCallback(() => setSession(null), []);

  // ---- Selectors -------------------------------------------------------
  const getUser = useCallback((id: string) => users.find((u) => u.id === id), [users]);
  const getProductsForSeller = useCallback(
    (sellerId: string) => products.filter((p) => p.sellerId === sellerId),
    [products],
  );
  /**
   * Statuses that admit no further rider-side actions. Mirrors the
   * backend's `OrderStatusTransitions.isTerminal` enum. Orders in these
   * states must NOT appear in the rider's "active" view — they are
   * archived to the delivery history instead.
   */
  const RIDER_TERMINAL_STATUSES = useMemo<Set<OrderStatus>>(
    () => new Set<OrderStatus>(["delivered", "cancelled", "rejected"]),
    [],
  );

  /**
   * Compare two orders by `updatedAt` descending. Falls back to
   * `createdAt` so freshly-created orders that haven't been updated
   * still sort deterministically.
   */
  const sortByUpdatedDesc = useCallback((a: Order, b: Order): number => {
    const aT = a.updatedAt ?? a.createdAt ?? "";
    const bT = b.updatedAt ?? b.createdAt ?? "";
    if (aT === bT) return 0;
    return aT < bT ? 1 : -1;
  }, []);

  const getOrdersForUser = useCallback(
    (userId: string, role: UserRole): Order[] => {
      // Backend orders come back with numeric ids (e.g. customerId = 1)
      // while the store's session.user.id is a string (e.g. "1"). Coerce
      // both sides to a string before comparing so historical orders
      // returned by the API always match the signed-in user.
      const uid = String(userId);
      switch (role) {
        case "customer":
          return orders.filter((o) => String(o.customerId) === uid);
        case "seller":
          return orders.filter((o) => String(o.sellerId) === uid);
        case "rider": {
          // A rider sees every order where they are the assigned rider
          // (or, when the backend hasn't assigned yet, every order on
          // the dispatch queue). The seller-rider scoping that used to
          // live in a local mock map is now enforced server-side via
          // `GET /api/orders/dispatch/available`.
          const filtered = orders.filter(
            (o) =>
              o.riderId === uid ||
              // Fall back: if `riderId` isn't set yet (dispatch queue),
              // show rows whose status implies "available to claim".
              (!o.riderId && o.status === "accepted"),
          );
          return filtered.slice().sort(sortByUpdatedDesc);
        }
        case "admin":
        case "supplier":
          return orders;
        default:
          return [];
      }
    },
    [orders, sortByUpdatedDesc],
  );
  const getRestockForSupplier = useCallback(
    (supplierId: string) =>
      restockRequests.filter((r) => !r.supplierId || r.supplierId === supplierId),
    [restockRequests],
  );
  const getRestockForSeller = useCallback(
    (sellerId: string) => restockRequests.filter((r) => r.sellerId === sellerId),
    [restockRequests],
  );
  const getPermitForSeller = useCallback(
    (sellerId: string) => permits.find((p) => p.sellerId === sellerId),
    [permits],
  );
  const getNotificationsForUser = useCallback(
    (userId: string) =>
      notifications
        .filter((n) => n.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notifications],
  );

  // ---- Logistics selectors ---------------------------------------------
  const getRoute = useCallback(
    (id: string) => routes.find((r) => r.id === id),
    [routes],
  );
  const getTrip = useCallback(
    (id: string) => trips.find((t) => t.id === id),
    [trips],
  );
  const getActiveTripForSupplier = useCallback(
    (supplierId: string) =>
      trips.find(
        (t) => t.supplierId === supplierId && t.status !== "completed",
      ),
    [trips],
  );
  const getTripsForSupplier = useCallback(
    (supplierId: string) =>
      trips
        .filter((t) => t.supplierId === supplierId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [trips],
  );

  // ---- Actions ---------------------------------------------------------
  /**
   * Internal helper: apply a successful service call result to store
   * state. Keeps the post-transition mutations in one place so the
   * six verbs below stay focused on routing + error handling.
   *
   * Merge semantics:
   *   • If a row with the same id is already present, replace it (idempotent
   *     server response wins).
   *   • If not present, append to the front.
   *   • All OTHER rows are preserved verbatim — a fresh create must
   *     NEVER delete previously visible orders.
   *
   * Sort by `updatedAt DESC` so the selector invariant (newest first)
   * holds even when a brand-new order is created against an already-
   * populated list.
   */
  const applyServiceResult = useCallback(
    (next: Order, notes: NotificationItem[]) => {
      setOrders((prev) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const idx = safePrev.findIndex((o) => o && o.id === next.id);
        let merged: Order[];
        if (idx === -1) {
          merged = [next, ...safePrev];
        } else {
          const copy = safePrev.slice();
          copy[idx] = next;
          merged = copy;
        }
        const sorted = merged.slice().sort(sortByUpdatedDesc);
        if (__DEV__) {
          console.info(
            "[RIDER_ORDERS][APPLY_SERVICE_RESULT]",
            JSON.stringify({
              incomingOrderId: next.id,
              previousStateCount: safePrev.length,
              previousStateIds: safePrev.map((order) => order.id),
              nextStateCount: sorted.length,
              nextStateIds: sorted.map((order) => order.id),
            }),
          );
        }
        return sorted;
      });
      if (notes.length) {
        setNotifications((prev) => [...notes, ...prev]);
      }
    },
    [sortByUpdatedDesc],
  );

  /**
   * Place a new order. Delegates to `OrderService.create`, which validates
   * the payload, persists to PostgreSQL via the Spring Boot backend, and
   * returns the audit-notes to write to the in-app notifications feed.
   */
  const placeOrder = useCallback(
    async (input: PlaceOrderInput): Promise<Order> => {
      const dto: CreateOrderDto = {
        customerId: input.customerId,
        customerName: input.customerName,
        sellerId: input.sellerId,
        sellerName: input.sellerName,
        items: input.items,
        total: input.total,
        phone: input.phone,
        deliveryLocation: input.deliveryLocation,
        notes: input.notes,
      };
      const result = await orderService.create(dto);
      applyServiceResult(result.order, result.auditNotes);
      return result.order;
    },
    [applyServiceResult],
  );

  /**
   * Seller accepts an order. After this:
   *   • order.status flips to "accepted" on the backend
   *   • every nearby rider (per `riderBroadcast`) receives an in-app
   *     notification tagged as a delivery request
   */
  const acceptOrder = useCallback(
    async (orderId: string) => {
      if (!session) throw new OrderServiceError("NOT_AUTHORIZED", "Not signed in.");
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new OrderServiceError("NOT_FOUND", "Order not found.");
      const result = await orderService.accept({ actor: session.user }, order);
      applyServiceResult(result.order, result.auditNotes);
    },
    [session, orders, applyServiceResult],
  );

  /**
   * Seller rejects a PENDING order. `reason` is optional but the UI
   * presents a modal so it's almost always supplied. Persists to
   * PostgreSQL via the backend's atomic state transition.
   */
  const rejectOrder = useCallback(
    async (orderId: string, reason?: string) => {
      if (!session) throw new OrderServiceError("NOT_AUTHORIZED", "Not signed in.");
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new OrderServiceError("NOT_FOUND", "Order not found.");
      const result = await orderService.reject(
        { actor: session.user, reason },
        order,
      );
      applyServiceResult(result.order, result.auditNotes);
    },
    [session, orders, applyServiceResult],
  );

  /**
   * Customer cancels a PENDING order. Persists to PostgreSQL via the
   * backend; the seller is notified through the audit-notes returned by
   * the service.
   */
  const cancelOrder = useCallback(
    async (orderId: string, reason?: string) => {
      if (!session) throw new OrderServiceError("NOT_AUTHORIZED", "Not signed in.");
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new OrderServiceError("NOT_FOUND", "Order not found.");
      const result = await orderService.cancel(
        { actor: session.user, reason },
        order,
      );
      applyServiceResult(result.order, result.auditNotes);
    },
    [session, orders, applyServiceResult],
  );

  /**
   * Rider claims an ACCEPTED order. The backend enforces atomicity via a
   * native UPDATE … RETURNING — throws RIDER_BUSY if another rider won
   * the race.
   */
  const claimOrder = useCallback(
    async (orderId: string) => {
      if (!session) throw new OrderServiceError("NOT_AUTHORIZED", "Not signed in.");
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new OrderServiceError("NOT_FOUND", "Order not found.");
      const result = await orderService.claim(
        { actor: session.user },
        order,
      );
      applyServiceResult(result.order, result.auditNotes);
    },
    [session, orders, applyServiceResult],
  );

  /**
   * Rider advances delivery. The state-machine guard inside
   * `OrderService.advance` rejects illegal jumps (e.g. picked_up →
   * delivered); the backend re-enforces the same guard on every PATCH.
   */
  const advanceDelivery = useCallback(
    async (
      orderId: string,
      next: "picked_up" | "in_transit" | "delivered",
    ) => {
      if (!session) throw new OrderServiceError("NOT_AUTHORIZED", "Not signed in.");
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new OrderServiceError("NOT_FOUND", "Order not found.");
      const result = await orderService.advance(
        { actor: session.user },
        order,
        next,
      );
      applyServiceResult(result.order, result.auditNotes);
    },
    [session, orders, applyServiceResult],
  );

  /**
   * Orders the signed-in user is currently eligible to claim.
   *
   * For riders this is the intersection of:
   *   • ACCEPTED + no rider assigned (status filter, same as before)
   *   • the rider's `seller_riders` team (new — mirrors the backend)
   *   • not in a terminal status (defensive — the backend already
   *     guarantees this, but a stale local row shouldn't slip through)
   *
   * Other roles return an empty list. Mock and live behavior share this
   * filter so the storefront demo behaves the same as the integration.
   *
   * Sorted by `updatedAt DESC` to match the backend and the rest of
   * the rider UI.
   */
  const availableOrdersForUser = useCallback((): Order[] => {
    if (!session) return [];
    if (session.user.role !== "rider") return [];
    // Backend's `GET /api/orders/dispatch/available` is authoritative —
    // sellers allowed per rider is enforced through the `seller_riders`
    // join table. Locally we mirror the safe shape: ACCEPTED, no
    // assigned rider, not terminal.
    const filtered = orders.filter(
      (o) =>
        o.status === "accepted" &&
        !o.riderId &&
        !RIDER_TERMINAL_STATUSES.has(o.status),
    );
    return filtered.slice().sort(sortByUpdatedDesc);
  }, [session, orders, RIDER_TERMINAL_STATUSES, sortByUpdatedDesc]);

  /**
   * Legacy verb kept for any screen still using the old flow shape.
   * Internally routes to the new verbs so behavior stays consistent.
   */
  const updateOrderStatus = useCallback(
    async (orderId: string, status: OrderStatus, _riderId?: string) => {
      switch (status) {
        case "accepted":
          return acceptOrder(orderId);
        case "rejected":
          return rejectOrder(orderId);
        case "cancelled":
          return cancelOrder(orderId);
        case "assigned":
          return claimOrder(orderId);
        case "picked_up":
        case "in_transit":
        case "delivered":
          return advanceDelivery(orderId, status);
        case "pending":
        default:
          throw new OrderServiceError(
            "INVALID_TRANSITION",
            `Cannot transition to ${status}.`,
          );
      }
    },
    [acceptOrder, rejectOrder, cancelOrder, claimOrder, advanceDelivery],
  );

  /**
   * Legacy verb — kept for backwards compatibility with older screens
   * that hand-pick a rider. Production callers should use `claimOrder`
   * (which hits `POST /api/orders/{id}/claim` and lets the backend
   * enforce the seller↔rider scoping via `seller_riders`).
   *
   * The previous in-memory scoping check against
   * `seededSellerRiders[order.sellerId]` has been removed — there is
   * no local rider pool to filter against, and the backend is the
   * authoritative source. Without an explicit seller↔rider assignment
   * rule, this verb simply forwards to the API, which will reject
   * mismatched pairs with `RIDER_NOT_ASSIGNED` when applicable.
   */
  const assignRider = useCallback(
    async (orderId: string, riderId: string, riderName: string) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) {
        throw new OrderServiceError("NOT_FOUND", `Order ${orderId} not found.`);
      }
      const updated = await OrdersApi.assignRider(orderId, riderId, riderName);
      setOrders((prev) => {
        const nextOrders = prev.map((o) => (o.id === orderId ? updated : o));
        if (__DEV__) {
          console.info(
            "[RIDER_ORDERS][ASSIGN_RIDER]",
            JSON.stringify({
              source: "api",
              orderId,
              previousStateCount: prev.length,
              previousStateIds: prev.map((o) => o.id),
              nextStateCount: nextOrders.length,
              nextStateIds: nextOrders.map((o) => o.id),
            }),
          );
        }
        return nextOrders;
      });
    },
    [orders],
  );

  const addProduct = useCallback(async (p: Omit<GasProduct, "id">) => {
    if (USE_MOCK) {
      setProducts((prev) => [{ ...p, id: `p-${Date.now()}` }, ...prev]);
      return;
    }
    const created = await ProductsApi.create(p);
    setProducts((prev) => [created, ...prev]);
  }, []);

  const updateProductStock = useCallback(
    async (productId: string, stock: number) => {
      if (USE_MOCK) {
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, stock } : p)),
        );
        return;
      }
      const updated = await ProductsApi.updateStock(productId, stock);
      setProducts((prev) => prev.map((p) => (p.id === productId ? updated : p)));
    },
    [],
  );

  const requestRestock = useCallback(
    async (r: Omit<RestockRequest, "id" | "createdAt" | "status">) => {
      if (USE_MOCK) {
        const req: RestockRequest = {
          ...r,
          id: `r-${Date.now()}`,
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        setRestockRequests((prev) => [req, ...prev]);
        return;
      }
      const created = await RestockApi.create(r);
      setRestockRequests((prev) => [created, ...prev]);
    },
    [],
  );

  const updateRestockStatus = useCallback(
    async (id: string, status: RestockRequest["status"]) => {
      if (USE_MOCK) {
        setRestockRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status } : r)),
        );
        return;
      }
      const updated = await RestockApi.updateStatus(id, status);
      setRestockRequests((prev) =>
        prev.map((r) => (r.id === id ? updated : r)),
      );
    },
    [],
  );

  const submitPermit = useCallback(
    async (p: Omit<PermitApplication, "id" | "submittedAt" | "status">) => {
      if (USE_MOCK) {
        const permit: PermitApplication = {
          ...p,
          id: `pm-${Date.now()}`,
          status: "pending",
          submittedAt: new Date().toISOString(),
        };
        setPermits((prev) => [permit, ...prev]);
        return;
      }
      const created = await PermitsApi.submit(p);
      setPermits((prev) => [created, ...prev]);
    },
    [],
  );

  const reviewPermit = useCallback(
    async (id: string, status: PermitStatus, note?: string) => {
      const now = new Date().toISOString();
      if (USE_MOCK) {
        setPermits((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, status, reviewedAt: now, reviewNote: note } : p,
          ),
        );
        const permit = permits.find((p) => p.id === id);
        if (permit) {
          setNotifications((prev) => [
            {
              id: `n-${Date.now()}`,
              userId: permit.sellerId,
              title: `Permit ${status}`,
              message:
                status === "approved"
                  ? "Your business permit has been approved."
                  : `Your permit was rejected. ${note ?? ""}`,
              type: "permit",
              read: false,
              createdAt: now,
            },
            ...prev,
          ]);
        }
        return;
      }
      const updated = await PermitsApi.review(id, status, note);
      setPermits((prev) => prev.map((p) => (p.id === id ? updated : p)));
    },
    [permits],
  );

  // ---- Live-API seller permit actions ---------------------------------

  /**
   * Internal helper: persist a fetched permit into the
   * {@link sellerPermits} slice and surface the new status on
   * {@link session.user.permitStatus} so the seller layout can render the
   * banner without re-fetching.
   */
  const applySellerPermit = useCallback(
    (permit: SellerPermit | null) => {
      if (!permit) return;
      setSellerPermits((prev) => ({ ...prev, [permit.sellerId]: permit }));
      const currentSession = sessionRef.current;
      if (
        currentSession &&
        currentSession.user.id === permit.sellerId &&
        currentSession.user.role === "seller"
      ) {
        const next: User = {
          ...currentSession.user,
          permitStatus: permit.status,
          isActive: permit.status === "approved",
        };
        setSession({ user: next, token: currentSession.token });
      }
    },
    [],
  );

  const fetchMyPermit = useCallback(async (): Promise<SellerPermit | null> => {
    if (USE_MOCK) return null;
    try {
      const permit = await PermitsApi.myPermit();
      applySellerPermit(permit);
      return permit;
    } catch (err) {
      // 404 from the server means no permit yet — treat as null.
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }, [applySellerPermit]);

  const uploadPermitDocument = useCallback(
    async (
      type: Exclude<PermitDocument["documentType"], "license">,
      file:
        | Blob
        | { uri: string; name: string; type?: string }
        | { uri: string; name?: string; type?: string },
      filename: string,
    ): Promise<PermitDocument> => {
      const form = new FormData();
      // React Native's `FormData` polyfill inspects the second argument and
      // expects a `{ uri, name, type }` triple for a file part. When the
      // caller already has a `Blob` (an Expo `File` subclass), append it
      // directly. We log the resulting envelope so silent failures show up
      // in the Metro / `adb logcat` console.
      const fallbackName = filename || `${type}.pdf`;
      let filePart: unknown = file;
      if (
        typeof file === "object" &&
        file !== null &&
        "uri" in (file as Record<string, unknown>)
      ) {
        const uriObj = file as { uri: string; name?: string; type?: string };
        filePart = {
          uri: uriObj.uri,
          name: uriObj.name ?? fallbackName,
          type: uriObj.type ?? "application/octet-stream",
        };
      }
      console.info(
        "[uploadPermitDocument] posting",
        JSON.stringify({
          type,
          filename: fallbackName,
          filePart,
          url: "/api/permits/me/documents",
        }),
      );
      form.append("file", filePart as Blob, fallbackName);
      try {
        // The document `type` is sent as a query parameter so the backend's
        // `@RequestParam("type")` receives it cleanly. Keeping it out of
        // the multipart body avoids any ambiguity in Spring's parameter
        // resolution across multipart endpoints.
        const document = await PermitsApi.uploadDocument(type, form);
        console.info(
          "[uploadPermitDocument] success",
          JSON.stringify({
            type,
            documentId: (document as PermitDocument).id,
            contentType: (document as PermitDocument).contentType,
            sizeBytes: (document as PermitDocument).sizeBytes,
          }),
        );
        // Re-fetch so the slice reflects the freshly-uploaded doc.
        await fetchMyPermit();
        return document;
      } catch (err) {
        console.error(
          "[uploadPermitDocument] failed",
          (err as Error)?.message,
          (err as { status?: number }).status,
        );
        throw err;
      }
    },
    [fetchMyPermit],
  );

  const deletePermitDocument = useCallback(
    async (documentId: string) => {
      await PermitsApi.deleteDocument(documentId);
      await fetchMyPermit();
    },
    [fetchMyPermit],
  );

  const submitMyPermit = useCallback(
    async (businessName: string): Promise<SellerPermit> => {
      const permit = await PermitsApi.submitApplication({ businessName });
      applySellerPermit(permit);
      return permit;
    },
    [applySellerPermit],
  );

  const fetchAdminPermits = useCallback(
    async (status?: PermitStatus): Promise<SellerPermit[]> => {
      if (USE_MOCK) return [];
      return PermitsApi.listForAdmin(status);
    },
    [],
  );

  const approveAdminPermit = useCallback(
    async (
      permitId: string,
      license?: { blob: Blob; filename: string },
    ): Promise<SellerPermit> => {
      // The admin UI today never supplies a license file at approval
      // time — the issued PDF is regenerated on demand by the server.
      // Sending an empty `multipart/form-data` envelope from React
      // Native's fetch (the only shape `api.upload()` supports) is the
      // documented source of "Network request failed" on Hermes / RN.
      // We branch here: JSON when no file is being uploaded, multipart
      // when one is. The backend's controller accepts both — see
      // AdminPermitController.approve.
      const updated = license
        ? await (async () => {
            const form = new FormData();
            form.append("license", license.blob, license.filename);
            return PermitsApi.approve(permitId, form);
          })()
        : await PermitsApi.approveJson(permitId);
      setSellerPermits((prev) => ({ ...prev, [updated.sellerId]: updated }));
      return updated;
    },
    [],
  );

  const rejectAdminPermit = useCallback(
    async (permitId: string, reason: string): Promise<SellerPermit> => {
      const updated = await PermitsApi.reject(permitId, reason);
      setSellerPermits((prev) => ({ ...prev, [updated.sellerId]: updated }));
      return updated;
    },
    [],
  );

  // ---- Rider verification (live API) -----------------------------------

  /**
   * Helper that mirrors the seller `applySellerPermit` pattern: store
   * the application under `riderPermits[riderId]` so any screen can
   * read it without another network call. Falls back to the signed-in
   * user id when the DTO has none.
   */
  const applyRiderApplication = useCallback(
    (application: RiderPermitSummary, fallbackRiderId?: string) => {
      const key = application.riderId || fallbackRiderId;
      if (!key) return;
      setRiderPermits((prev) => ({ ...prev, [key]: application }));
    },
    [],
  );

  const fetchMyRiderApplication = useCallback(
    async (): Promise<RiderPermitSummary | null> => {
      if (USE_MOCK) return null;
      const application = await RiderPermitsApi.myApplicationOrNull();
      if (application) applyRiderApplication(application);
      return application;
    },
    [applyRiderApplication],
  );

  /**
   * Upload one PDF or image for a rider slot. The `file` argument may be
   * either a real `Blob` (Expo `File` subclass) or a
   * `{ uri, name, type }` triple — React Native accepts both as the
   * second argument of `FormData.append`. Mirrors the seller
   * `uploadPermitDocument` helper.
   */
  const uploadRiderApplicationDocument = useCallback(
    async (
      type: Exclude<
        RiderPermitSummary["documents"][number]["documentType"],
        "rider_permit"
      >,
      file: Blob | { uri: string; name: string; type?: string },
      filename: string,
    ) => {
      const form = new FormData();
      if (file instanceof Blob) {
        form.append("file", file, filename);
      } else {
        // RN multipart encoder accepts a { uri, name, type } triple as
        // a stand-in for Blob. The shape survives every RN release.
        form.append("file", {
          uri: file.uri,
          name: file.name ?? filename,
          type: file.type ?? "application/octet-stream",
        } as unknown as Blob);
      }
      await RiderPermitsApi.uploadDocument(type, form);
      const refreshed = await RiderPermitsApi.myApplicationOrNull();
      if (refreshed) applyRiderApplication(refreshed);
      // Component reads the refreshed application to find the new doc,
      // so the caller doesn't need a precise return value.
      return null as unknown as RiderPermitSummary["documents"][number];
    },
    [applyRiderApplication],
  );

  const deleteRiderApplicationDocument = useCallback(
    async (documentId: string): Promise<void> => {
      await RiderPermitsApi.deleteDocument(documentId);
      const refreshed = await RiderPermitsApi.myApplicationOrNull();
      if (refreshed) applyRiderApplication(refreshed);
    },
    [applyRiderApplication],
  );

  const submitRiderApplication = useCallback(
    async (): Promise<RiderPermitSummary> => {
      const submitted = await RiderPermitsApi.submitApplication();
      applyRiderApplication(submitted);
      return submitted;
    },
    [applyRiderApplication],
  );

  const fetchAdminRiderApplications = useCallback(
    async (status?: PermitStatus): Promise<RiderPermitSummary[]> => {
      if (USE_MOCK) return [];
      return AdminRiderPermitsApi.listForAdmin(status);
    },
    [],
  );

  const approveAdminRiderApplication = useCallback(
    async (applicationId: string): Promise<RiderPermitSummary> => {
      const updated = await AdminRiderPermitsApi.approveJson(applicationId);
      setRiderPermits((prev) => ({
        ...prev,
        [updated.riderId]: updated,
      }));
      return updated;
    },
    [],
  );

  const rejectAdminRiderApplication = useCallback(
    async (
      applicationId: string,
      reason: string,
    ): Promise<RiderPermitSummary> => {
      const updated = await AdminRiderPermitsApi.reject(applicationId, reason);
      setRiderPermits((prev) => ({
        ...prev,
        [updated.riderId]: updated,
      }));
      return updated;
    },
    [],
  );

  // ---- Supplier verification (live API) --------------------------------

  /**
   * Helper mirroring `applyRiderApplication`: cache the application
   * under `supplierApplications[supplierId]` so any screen can read it
   * without another network call.
   */
  const applySupplierApplication = useCallback(
    (application: SupplierApplication, fallbackSupplierId?: string) => {
      const key = application.supplierId || fallbackSupplierId;
      if (!key) return;
      setSupplierApplications((prev) => ({ ...prev, [key]: application }));
    },
    [],
  );

  const fetchMySupplierApplication = useCallback(
    async (): Promise<SupplierApplication | null> => {
      if (USE_MOCK) return null;
      const application = await SupplierApplicationsApi.myApplicationOrNull();
      if (application) applySupplierApplication(application);
      return application;
    },
    [applySupplierApplication],
  );

  /**
   * Upload one PDF or image for a supplier slot. The `file` argument may
   * be either a real `Blob` (Expo `File` subclass) or a
   * `{ uri, name, type }` triple — React Native accepts both as the
   * second argument of `FormData.append`. Mirrors
   * `uploadRiderApplicationDocument`.
   */
  const uploadSupplierApplicationDocument = useCallback(
    async (
      type: Exclude<SupplierApplicationDocumentType, "supplier_certificate">,
      file: Blob | { uri: string; name: string; type?: string },
      filename: string,
    ): Promise<void> => {
      const form = new FormData();
      if (file instanceof Blob) {
        form.append("file", file, filename);
      } else {
        // RN multipart encoder accepts a { uri, name, type } triple as
        // a stand-in for Blob. The shape survives every RN release.
        form.append("file", {
          uri: file.uri,
          name: file.name ?? filename,
          type: file.type ?? "application/octet-stream",
        } as unknown as Blob);
      }
      await SupplierApplicationsApi.uploadDocument(type, form);
      const refreshed = await SupplierApplicationsApi.myApplicationOrNull();
      if (refreshed) applySupplierApplication(refreshed);
    },
    [applySupplierApplication],
  );

  const deleteSupplierApplicationDocument = useCallback(
    async (documentId: string): Promise<void> => {
      await SupplierApplicationsApi.deleteDocument(documentId);
      const refreshed = await SupplierApplicationsApi.myApplicationOrNull();
      if (refreshed) applySupplierApplication(refreshed);
    },
    [applySupplierApplication],
  );

  const submitSupplierApplication = useCallback(
    async (): Promise<SupplierApplication> => {
      const submitted = await SupplierApplicationsApi.submitApplication();
      applySupplierApplication(submitted);
      return submitted;
    },
    [applySupplierApplication],
  );

  const fetchAdminSupplierApplications = useCallback(
    async (status?: PermitStatus): Promise<SupplierApplication[]> => {
      if (USE_MOCK) return [];
      return AdminSupplierApplicationsApi.listForAdmin(status);
    },
    [],
  );

  const approveAdminSupplierApplication = useCallback(
    async (applicationId: string): Promise<SupplierApplication> => {
      const updated = await AdminSupplierApplicationsApi.approve(applicationId);
      setSupplierApplications((prev) => ({
        ...prev,
        [updated.supplierId]: updated,
      }));
      return updated;
    },
    [],
  );

  const rejectAdminSupplierApplication = useCallback(
    async (
      applicationId: string,
      reason: string,
    ): Promise<SupplierApplication> => {
      const updated = await AdminSupplierApplicationsApi.reject(
        applicationId,
        reason,
      );
      setSupplierApplications((prev) => ({
        ...prev,
        [updated.supplierId]: updated,
      }));
      return updated;
    },
    [],
  );

  const markNotificationRead = useCallback(async (id: string) => {
    if (USE_MOCK) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      return;
    }
    const updated = await NotificationsApi.markRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? updated : n)),
    );
  }, []);

  /**
   * Bulk-mark every notification that belongs to the supplied user id
   * as read in a single round-trip. Used by the Seller Notifications
   * screen on mount so the unread badge on the dashboard / chrome
   * clears immediately, without waiting for a refresh.
   *
   * <p>The local-state flip is applied <em>before</em> the API call so
   * the badge vanishes synchronously; if the network request fails the
   * backend will re-emit unread rows on the next refresh and the user
   * will see them again — the local flip is therefore the optimistic
   * path, not a destructive overwrite.</p>
   *
   * <p>If {@code userId} is omitted the helper falls back to the
   * currently signed-in session user, which is the common case when
   * a Seller screen calls it.</p>
   */
  const markAllNotificationsRead = useCallback(
    async (userId?: string) => {
      const targetId = userId ?? session?.user?.id;
      if (!targetId) return;
      // Optimistic local flip — covers both the seller dashboard
      // badge and the inline counts in the notifications screen
      // without waiting for the network.
      setNotifications((prev) =>
        prev.map((n) =>
          n.userId === targetId ? { ...n, read: true } : n,
        ),
      );
      if (USE_MOCK) return;
      try {
        await NotificationsApi.markAllRead();
      } catch (err) {
        // Network failure — leave the local flip in place (the badge
        // stays cleared, which is the better UX) but surface the
        // failure in the console so it's visible in `adb logcat` /
        // Metro.
        console.warn(
          "[StoreContext] markAllNotificationsRead backend call failed",
          (err as Error)?.message,
        );
      }
    },
    [session?.user?.id],
  );

  const addComplaint = useCallback(
    async (c: Omit<Complaint, "id" | "createdAt" | "status">) => {
      if (USE_MOCK) {
        setComplaints((prev) => [
          {
            ...c,
            id: `c-${Date.now()}`,
            status: "open",
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        return;
      }
      const created = await ComplaintsApi.create(c);
      setComplaints((prev) => [created, ...prev]);
    },
    [],
  );

  const resolveComplaint = useCallback(async (id: string) => {
    if (USE_MOCK) {
      setComplaints((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "resolved" } : c)),
      );
      return;
    }
    const updated = await ComplaintsApi.resolve(id);
    setComplaints((prev) =>
      prev.map((c) => (c.id === id ? updated : c)),
    );
  }, []);

  const updateUserStatus = useCallback(async (id: string, active: boolean) => {
    if (USE_MOCK) {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, active } : u)));
      return;
    }
    const updated = await UsersApi.setStatus(id, active);
    setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
  }, []);

  /**
   * Patch the signed-in user. The home-screen location filter reads
   * from `session.user` so any change here will be picked up by
   * `useNearbySellers` on the next render — no extra plumbing needed.
   */
  /**
   * Patch the signed-in user. Personal fields (full name / username /
   * email / phone) ride along on `PATCH /api/customers/me`; the
   * location tuple is persisted separately via `saveCustomerLocation`
   * (the Profile screen calls both in sequence on save).
   *
   * The previous implementation called a non-existent
   * `PATCH /api/users/{id}` route and surfaced "No endpoint mapped
   * to api/users/{id}" to the user. Routing personal fields through
   * the customer-scoped endpoint keeps the actor id on the auth
   * filter (no id-in-path to tamper with) and matches the existing
   * `customers` controller architecture.
   */
  const updateProfile = useCallback(
    async (patch: Partial<Omit<User, "id" | "role" | "createdAt">>) => {
      if (!session) return;
      if (USE_MOCK) {
        const next = { ...session.user, ...patch };
        setUsers((prev) =>
          prev.map((u) => (u.id === next.id ? next : u)),
        );
        setSession((prev) => (prev ? { ...prev, user: next } : prev));
        return;
      }
      // Forward only the personal fields the backend accepts. The
      // location tuple is persisted separately by saveCustomerLocation,
      // so the PATCH stays narrowly scoped.
      const personalFields: {
        fullName?: string;
        username?: string;
        email?: string;
        phone?: string;
      } = {};
      if (patch.fullName !== undefined) personalFields.fullName = patch.fullName;
      if (patch.username !== undefined) personalFields.username = patch.username;
      if (patch.email !== undefined) personalFields.email = patch.email;
      if (patch.phone !== undefined) personalFields.phone = patch.phone;

      if (Object.keys(personalFields).length === 0) {
        // Nothing to send for the personal side — keep the existing
        // session/user list intact so the surrounding save flow can
        // still call saveCustomerLocation without merging stale data.
        return;
      }

      const saved = await CustomersApi.patchMyProfile(personalFields);
      const merged: User = { ...session.user, ...saved };
      setUsers((prev) =>
        prev.map((u) => (u.id === merged.id ? merged : u)),
      );
      setSession((prev) => (prev ? { ...prev, user: merged } : prev));
    },
    [session],
  );

  /**
   * Persist the signed-in customer's location and refresh the
   * session-cached copy.
   *
   * The server response is merged rather than the outgoing patch: the
   * backend geocodes the address and returns the resolved `lat`/`lng`,
   * and those coordinates are exactly what `useNearbySellers` watches to
   * re-query `GET /api/sellers?lat&lng&radiusKm`. Merging the patch
   * would leave the session without coordinates and the nearby list
   * stale until the next login.
   *
   * Errors propagate to the caller so the Profile screen can surface its
   * existing "Save failed" alert with the server's validation message.
   */
  const saveCustomerLocation = useCallback(
    async (patch: CustomerLocation) => {
      if (!session) return;
      const saved = await CustomersApi.updateMyLocation(patch);
      setSession((prev) =>
        prev ? { ...prev, user: mergeCustomerLocation(prev.user, saved) } : prev,
      );
      setUsers((prev) =>
        prev.map((u) =>
          u.id === session.user.id ? mergeCustomerLocation(u, saved) : u,
        ),
      );
    },
    [session],
  );

  /**
   * Persist the signed-in seller's Business Address on `seller_profiles`.
   *
   * Backend geocodes `location` and returns the resolved coordinates in
   * the response, so we merge the *response* onto `session.user` (and
   * the equivalent row in `users[]`) just like `saveCustomerLocation`
   * does for the customer flow. That merge is what invalidates the
   * session-cached business coordinates so the customer "Nearby
   * Sellers" pipeline picks them up on its next query.
   *
   * When the call site supplies `deviceCoords` (the device-GPS fix
   * captured just before this call), the action forwards them as
   * `lat` / `lng` on the patch so the saved row has the exact GPS fix.
   * When `deviceCoords` is null/undefined the backend geocodes the typed
   * address — either way the seller never sees the value.
   */
  const saveSellerLocation = useCallback(
    async (patch: {
      businessName?: string;
      location: string;
      phone?: string;
      region?: string | null;
      district?: string | null;
      ward?: string | null;
      street?: string | null;
      deviceCoords?: { lat: number; lng: number } | null;
      /**
       * Coordinates the seller explicitly picked / typed in the map
       * picker. Wins over `deviceCoords` when both are present; when
       * neither is set the backend geocodes the typed address (existing
       * behaviour, preserved for the registration flow).
       */
      pinCoords?: { lat: number; lng: number } | null;
    }) => {
      if (!session) return;
      // Pin precedence: pinCoords (manual) > deviceCoords (GPS) > none.
      // Both being set is unexpected but should never silently drop the
      // seller's intent, so the manual pin wins.
      const coords =
        patch.pinCoords && Number.isFinite(patch.pinCoords.lat) && Number.isFinite(patch.pinCoords.lng)
          ? patch.pinCoords
          : patch.deviceCoords &&
              Number.isFinite(patch.deviceCoords.lat) &&
              Number.isFinite(patch.deviceCoords.lng)
            ? patch.deviceCoords
            : null;
      // Stop sending `phone` on every location save — it was coupling
      // contact data to location writes. Callers that want to update
      // the phone should go through the dedicated contact endpoint.
      const saved = await SellersApi.updateMe({
        businessName: patch.businessName ?? session.user.fullName,
        location: patch.location,
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        region: patch.region ?? undefined,
        district: patch.district ?? undefined,
        ...(patch.ward !== undefined ? { ward: patch.ward } : {}),
        ...(patch.street !== undefined ? { street: patch.street } : {}),
        lat: coords ? coords.lat : undefined,
        lng: coords ? coords.lng : undefined,
      });
      const num = (v: number | null | undefined): number | undefined =>
        typeof v === "number" && Number.isFinite(v) ? v : undefined;
      const text = (
        v: string | null | undefined,
      ): string | undefined =>
        v === null || v === undefined || v === "" ? undefined : v;
      setSession((prev) =>
        prev
          ? {
              ...prev,
              user: {
                ...prev.user,
                address: text(saved.location) ?? prev.user.address,
                district: text(saved.district) ?? prev.user.district,
                region: text(saved.region) ?? prev.user.region,
                ward: text(saved.ward) ?? prev.user.ward,
                street: text(saved.street) ?? prev.user.street,
                lat: num(saved.lat) ?? prev.user.lat,
                lng: num(saved.lng) ?? prev.user.lng,
              },
            }
          : prev,
      );
      setUsers((prev) =>
        prev.map((u) =>
          u.id === session.user.id
            ? {
                ...u,
                address: text(saved.location) ?? u.address,
                district: text(saved.district) ?? u.district,
                region: text(saved.region) ?? u.region,
                ward: text(saved.ward) ?? u.ward,
                street: text(saved.street) ?? u.street,
                lat: num(saved.lat) ?? u.lat,
                lng: num(saved.lng) ?? u.lng,
              }
            : u,
        ),
      );
    },
    [session],
  );

  // ---- Supplier logistics actions -------------------------------------

  /**
   * Start a delivery trip on a route. The trip is created in `started`
   * status, immediately advances to `in_transit`, a notification + local
   * push is fanned out to every seller on the route, and a supplier-side
   * "Trip started" notification is recorded.
   */
  const startTrip = useCallback(
    async (input: StartTripInput): Promise<DeliveryTrip> => {
      const route = routes.find((r) => r.id === input.routeId);
      const vehicle = vehicles.find((v) => v.id === input.vehicleId);
      const rider = riders.find((r) => r.id === input.riderId);
      const supplierId = session?.user.id ?? "10";
      const supplierName = session?.user.fullName ?? "Supplier";

      if (!route || !vehicle || !rider) {
        throw new Error("Route, vehicle, or rider not found.");
      }

      const now = new Date().toISOString();
      // Snapshot the route's stops so the trip is stable even if the
      // route is later edited.
      const stops: RouteStop[] = route.stops.map((s) => ({ ...s }));
      // Mark every stop as `started` so the seller UI flips from
      // "Scheduled" to "On the way" immediately on trip start.
      const startedStops: RouteStop[] = stops.map((s) => ({
        ...s,
        status: "started",
      }));

      const trip: DeliveryTrip = {
        id: `trip-${Date.now()}`,
        supplierId,
        routeId: route.id,
        routeName: route.name,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        riderId: rider.id,
        riderName: rider.fullName,
        date: input.date,
        departureTime: input.departureTime,
        status: "in_transit",
        startedAt: now,
        progress: 0,
        positions: route.polyline.length > 0 ? [route.polyline[0]] : [],
        stops: startedStops,
      };

      setTrips((prev) => [trip, ...prev]);

      // Supplier-side feed entry so the Notifications screen shows the
      // event in the supplier's own history.
      const supplierNote: NotificationItem = {
        id: `sn-trip-${Date.now()}`,
        userId: supplierId,
        title: "Trip started",
        message: `${route.name} route started at ${input.departureTime} on ${vehicle.plate} with ${rider.fullName}.`,
        type: "trip_started",
        read: false,
        createdAt: now,
      };
      setNotifications((prev) => [supplierNote, ...prev]);

      // Per-seller fan-out. One in-app notification + one local push
      // per seller on the route. Promise.all so the banners all fire in
      // the same OS frame.
      const sellerNotes: NotificationItem[] = startedStops.map((s) => ({
        id: `sn-sel-${Date.now()}-${s.sellerId}`,
        userId: s.sellerId,
        title: "Supplier started delivery",
        message: `${supplierName} is on the way to ${route.name}.`,
        type: "delivery",
        read: false,
        createdAt: now,
      }));
      setNotifications((prev) => [...sellerNotes, ...prev]);

      // Fire local OS notifications (best-effort — never throws).
      await requestNotificationPermission();
      await fanOutLocalNotifications(
        sellerNotes.map((n) => ({
          title: n.title,
          body: n.message,
          data: { tripId: trip.id, sellerId: n.userId },
        })),
      );

      return trip;
    },
    [routes, vehicles, riders, session],
  );

  /**
   * Advance a live trip by `deltaProgress` (0..1) along its polyline.
   *
   * Side effects:
   *  1. Pushes the new supplier position into `positions`.
   *  2. Re-evaluates per-stop status. When the supplier enters the
   *     `NEAR_RADIUS_METERS` radius of a seller for the first time, a
   *     `near_arrival` notification is recorded and a local push fires.
   *  3. Marks the trip `completed` once `progress >= 1` AND every stop
   *     has been individually delivered by the supplier.
   */
  const tickTrip = useCallback(
    (tripId: string, deltaProgress = 0.05): DeliveryTrip | null => {
      let next: DeliveryTrip | null = null;
      setTrips((prev) => {
        const list = prev.map((t) => {
          if (t.id !== tripId) return t;
          if (t.status === "completed") return t;

          const route = routes.find((r) => r.id === t.routeId);
          if (!route || route.polyline.length === 0) return t;

          const newProgress = Math.min(1, t.progress + deltaProgress);
          const here = pointAtProgress(
            { polyline: route.polyline } as any,
            newProgress,
          );

          // Update per-stop status by distance. The first time we enter
          // the radius, flip status AND emit a near_arrival notification.
          const near = new Set<string>();
          const newStops: RouteStop[] = t.stops.map((s) => {
            if (s.status === "delivered") return s;
            const dist = haversineMeters(here, { lat: s.lat, lng: s.lng });
            if (dist <= NEAR_RADIUS_METERS) {
              near.add(s.sellerId);
              if (s.status !== "near_shop") {
                return { ...s, status: "near_shop" };
              }
              return s;
            }
            // Stops already past the supplier → on_the_way.
            if (
              newProgress > 0 &&
              t.stops.filter((x) => x.status === "delivered").length +
                t.stops.filter((x) => x.status === "near_shop").length >=
                s.sequence
            ) {
              if (s.status === "started" || s.status === "scheduled") {
                return { ...s, status: "on_the_way" };
              }
            }
            return s;
          });

          const allDelivered = newStops.every((s) => s.status === "delivered");
          const reachedEnd = newProgress >= 1;
          const status: DeliveryTrip["status"] =
            allDelivered || (reachedEnd && allDelivered) ? "completed" : "in_transit";

          const updated: DeliveryTrip = {
            ...t,
            progress: newProgress,
            positions: [...t.positions, here],
            stops: newStops,
            status,
            completedAt:
              status === "completed" ? new Date().toISOString() : t.completedAt,
          };
          next = updated;
          return updated;
        });
        return list;
      });

      // Fire near_arrival side effects in a microtask so we can read
      // the freshly-saved `next` value.
      if (next && typeof next !== "string") {
        const trip = next as DeliveryTrip;
        const previouslyNear = new Set<string>();
        trips
          .find((t) => t.id === tripId)
          ?.stops.forEach((s) => {
            if (s.status === "near_shop") previouslyNear.add(s.sellerId);
          });
        const now = new Date().toISOString();
        const fresh: NotificationItem[] = [];
        trip.stops.forEach((s) => {
          if (s.status === "near_shop" && !previouslyNear.has(s.sellerId)) {
            fresh.push({
              id: `sn-near-${Date.now()}-${s.sellerId}`,
              userId: s.sellerId,
              title: "The supplier is near your shop",
              message: `${trip.riderName} is within 500 m of ${s.sellerName}.`,
              type: "near_arrival",
              read: false,
              createdAt: now,
            });
          }
        });
        if (fresh.length > 0) {
          setNotifications((prev) => [...fresh, ...prev]);
          fanOutLocalNotifications(
            fresh.map((n) => ({
              title: n.title,
              body: n.message,
              data: { tripId: trip.id, sellerId: n.userId },
            })),
          );
        }
        // Trip completed fan-out.
        if (
          trip.status === "completed" &&
          trips.find((t) => t.id === tripId)?.status !== "completed"
        ) {
          const supplierNote: NotificationItem = {
            id: `sn-done-${Date.now()}`,
            userId: trip.supplierId,
            title: "Trip completed",
            message: `${trip.routeName} route finished. All sellers served.`,
            type: "trip_completed",
            read: false,
            createdAt: now,
          };
          const sellerNotes: NotificationItem[] = trip.stops.map((s) => ({
            id: `sn-done-sel-${Date.now()}-${s.sellerId}`,
            userId: s.sellerId,
            title: "Delivery complete",
            message: `${trip.routeName} route finished. Your supply has been delivered.`,
            type: "delivery",
            read: false,
            createdAt: now,
          }));
          setNotifications((prev) => [supplierNote, ...sellerNotes, ...prev]);
          fanOutLocalNotifications(
            sellerNotes.map((n) => ({
              title: n.title,
              body: n.message,
              data: { tripId: trip.id, sellerId: n.userId },
            })),
          );
        }
      }

      return next as DeliveryTrip | null;
    },
    [routes, trips],
  );

  /**
   * Mark a single stop as delivered. If all stops are now delivered,
   * the trip flips to `completed` and a completion notification is
   * written.
   */
  const markStopDelivered = useCallback(
    (tripId: string, sellerId: string) => {
      const now = new Date().toISOString();
      let completedTrip: DeliveryTrip | null = null;
      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t;
          const newStops = t.stops.map((s) =>
            s.sellerId === sellerId
              ? { ...s, status: "delivered" as const, deliveredAt: now }
              : s,
          );
          const allDone = newStops.every((s) => s.status === "delivered");
          const next: DeliveryTrip = {
            ...t,
            stops: newStops,
            status: allDone ? "completed" : t.status,
            completedAt: allDone ? now : t.completedAt,
          };
          if (allDone) completedTrip = next;
          return next;
        }),
      );
      if (completedTrip) {
        const trip = completedTrip as DeliveryTrip;
        const supplierNote: NotificationItem = {
          id: `sn-done-${Date.now()}`,
          userId: trip.supplierId,
          title: "Trip completed",
          message: `${trip.routeName} route finished. All sellers served.`,
          type: "trip_completed",
          read: false,
          createdAt: now,
        };
        const sellerNotes: NotificationItem[] = trip.stops.map((s) => ({
          id: `sn-done-sel-${Date.now()}-${s.sellerId}`,
          userId: s.sellerId,
          title: "Delivery complete",
          message: `Your supply has been delivered.`,
          type: "delivery",
          read: false,
          createdAt: now,
        }));
        setNotifications((prev) => [supplierNote, ...sellerNotes, ...prev]);
        fanOutLocalNotifications(
          sellerNotes.map((n) => ({
            title: n.title,
            body: n.message,
            data: { tripId: trip.id, sellerId: n.userId },
          })),
        );
        // Drop a final local push confirming the supplier's wrap-up.
        scheduleLocalNotification({
          title: "Trip completed",
          body: `${trip.routeName} route finished — great work.`,
        });
      }
    },
    [],
  );

  /** Create a new delivery route (used by the Routes screen). */
  const createRoute = useCallback(
    async (
      input: Omit<DeliveryRoute, "id" | "polyline"> & { polyline?: LatLng[] },
    ): Promise<DeliveryRoute> => {
      const id = `r-${Date.now()}`;
      const polyline: LatLng[] =
        input.polyline && input.polyline.length > 0
          ? input.polyline
          : input.stops.length > 1
            ? // Fall back to a straight-line polyline through the stops.
              input.stops.map((s) => ({ lat: s.lat, lng: s.lng }))
            : [];
      const route: DeliveryRoute = { ...input, id, polyline };
      setRoutes((prev) => [...prev, route]);
      return route;
    },
    [],
  );

  const toggleRouteActive = useCallback((id: string, active: boolean) => {
    setRoutes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, active } : r)),
    );
  }, []);

  /** Add a new vehicle to the fleet. Persists to the backend so the
   * vehicle survives a refresh and is selectable on the Live Delivery
   * form. Falls back to a local-only insertion when the API rejects
   * (e.g. offline) so the UI never blocks on the network. */
  const addVehicle = useCallback(async (input: Omit<Vehicle, "id">) => {
    if (USE_MOCK) {
      const vehicle: Vehicle = { ...input, id: `v-${Date.now()}` };
      setVehicles((prev) => [...prev, vehicle]);
      return vehicle;
    }
    try {
      const vehicle = await VehiclesApi.create({
        plate: input.plate,
        model: input.model,
        capacityKg: input.capacityKg,
      });
      setVehicles((prev) => [...prev, vehicle]);
      return vehicle;
    } catch (err) {
      if (__DEV__) {
        console.warn(
          "[VEHICLES][CREATE_FAILED]",
          (err as Error)?.message ?? String(err),
        );
      }
      // Local-only fallback so the UI can still render the row in the
      // current session; the next refresh() will reconcile against the
      // backend (the row will simply be absent).
      const vehicle: Vehicle = { ...input, id: `v-local-${Date.now()}` };
      setVehicles((prev) => [...prev, vehicle]);
      return vehicle;
    }
  }, []);

  const toggleVehicleActive = useCallback(
    (id: string, active: boolean) => {
      setVehicles((prev) =>
        prev.map((v) => (v.id === id ? { ...v, active } : v)),
      );
      if (USE_MOCK) return;
      // Fire-and-forget — backend persistence is best-effort so the UI
      // stays responsive while the network request is in flight.
      VehiclesApi.setActive(id, active).catch((err) => {
        if (__DEV__) {
          console.warn(
            "[VEHICLES][SET_ACTIVE_FAILED]",
            (err as Error)?.message ?? String(err),
          );
        }
      });
    },
    [],
  );

  /** Add a new rider to the team. */
  const addRider = useCallback(async (input: Omit<Rider, "id">) => {
    const rider: Rider = { ...input, id: `rider-${Date.now()}` };
    setRiders((prev) => [...prev, rider]);
    return rider;
  }, []);

  const toggleRiderActive = useCallback((id: string, active: boolean) => {
    setRiders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, active } : r)),
    );
  }, []);

  // ---- Memoized value --------------------------------------------------
  const value = useMemo<StoreShape>(
    () => ({
      session,
      loading,
      error,
      errorCode,
      usingMock: USE_MOCK,
      login,
      register,
      logout,
      refresh,
      users,
      products,
      orders,
      restockRequests,
      permits,
      sellerPermits,
      riderPermits,
      supplierApplications,
      notifications,
      complaints,
      sellers,
      emergencyContacts,
      routes,
      vehicles,
      riders,
      trips,
      getUser,
      getProductsForSeller,
      getOrdersForUser,
      getRestockForSupplier,
      getRestockForSeller,
      getPermitForSeller,
      getNotificationsForUser,
      getRoute,
      getTrip,
      getActiveTripForSupplier,
      getTripsForSupplier,
      placeOrder,
      acceptOrder,
      rejectOrder,
      cancelOrder,
      claimOrder,
      advanceDelivery,
      availableOrdersForUser,
      updateOrderStatus,
      assignRider,
      addProduct,
      updateProductStock,
      requestRestock,
      updateRestockStatus,
      submitPermit,
      reviewPermit,
      fetchMyPermit,
      uploadPermitDocument,
      deletePermitDocument,
      submitMyPermit,
      fetchAdminPermits,
      approveAdminPermit,
      rejectAdminPermit,
      fetchMyRiderApplication,
      uploadRiderApplicationDocument,
      deleteRiderApplicationDocument,
      submitRiderApplication,
      fetchAdminRiderApplications,
      approveAdminRiderApplication,
      rejectAdminRiderApplication,
      fetchMySupplierApplication,
      uploadSupplierApplicationDocument,
      deleteSupplierApplicationDocument,
      submitSupplierApplication,
      fetchAdminSupplierApplications,
      approveAdminSupplierApplication,
      rejectAdminSupplierApplication,
      markNotificationRead,
      markAllNotificationsRead,
      addComplaint,
      resolveComplaint,
      updateUserStatus,
      updateProfile,
      saveCustomerLocation,
      saveSellerLocation,
      startTrip,
      tickTrip,
      markStopDelivered,
      createRoute,
      toggleRouteActive,
      addVehicle,
      toggleVehicleActive,
      addRider,
      toggleRiderActive,
    }),
    [
      session,
      loading,
      error,
      errorCode,
      login,
      register,
      logout,
      refresh,
      users,
      products,
      orders,
      restockRequests,
      permits,
      sellerPermits,
      riderPermits,
      supplierApplications,
      notifications,
      complaints,
      sellers,
      emergencyContacts,
      routes,
      vehicles,
      riders,
      trips,
      getUser,
      getProductsForSeller,
      getOrdersForUser,
      getRestockForSupplier,
      getRestockForSeller,
      getPermitForSeller,
      getNotificationsForUser,
      getRoute,
      getTrip,
      getActiveTripForSupplier,
      getTripsForSupplier,
      placeOrder,
      acceptOrder,
      rejectOrder,
      cancelOrder,
      claimOrder,
      advanceDelivery,
      availableOrdersForUser,
      updateOrderStatus,
      assignRider,
      addProduct,
      updateProductStock,
      requestRestock,
      updateRestockStatus,
      submitPermit,
      reviewPermit,
      fetchMyPermit,
      uploadPermitDocument,
      deletePermitDocument,
      submitMyPermit,
      fetchAdminPermits,
      approveAdminPermit,
      rejectAdminPermit,
      fetchMyRiderApplication,
      uploadRiderApplicationDocument,
      deleteRiderApplicationDocument,
      submitRiderApplication,
      fetchAdminRiderApplications,
      approveAdminRiderApplication,
      rejectAdminRiderApplication,
      fetchMySupplierApplication,
      uploadSupplierApplicationDocument,
      deleteSupplierApplicationDocument,
      submitSupplierApplication,
      fetchAdminSupplierApplications,
      approveAdminSupplierApplication,
      rejectAdminSupplierApplication,
      markNotificationRead,
      markAllNotificationsRead,
      addComplaint,
      resolveComplaint,
      updateUserStatus,
      updateProfile,
      saveCustomerLocation,
      saveSellerLocation,
      startTrip,
      tickTrip,
      markStopDelivered,
      createRoute,
      toggleRouteActive,
      addVehicle,
      toggleVehicleActive,
      addRider,
      toggleRiderActive,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
