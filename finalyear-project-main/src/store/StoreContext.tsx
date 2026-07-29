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
} from "../../constants/types";
import {
  seedComplaints,
  seedEmergencyContacts,
  seedNotifications,
  seedOrders,
  seedPermits,
  seedProducts,
  seedRestockRequests,
  seedSellers,
  seedUsers,
  seedRoutes,
  seedVehicles,
  seedRiders,
  seedTrips,
} from "./data";
import { API_CONFIG } from "../api/config";
import { setTokenProvider, ApiError } from "../api";
import {
  AuthApi,
  ComplaintsApi,
  NotificationsApi,
  OrdersApi,
  PermitsApi,
  ProductsApi,
  RestockApi,
  RidersApi,
  SellersApi,
  UsersApi,
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
import { seededSellerRiders, sellersForRider } from "../lib/riderMatching";

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
  markNotificationRead: (id: string) => Promise<void>;
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
   * because `useNearbySellers` reads them off the same store. Backend
   * wiring lives in `UsersApi.updateProfile`.
   */
  updateProfile: (patch: Partial<Omit<User, "id" | "role" | "createdAt">>) => Promise<void>;
}

export interface RegisterInput {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
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

// Demo-only mock credentials. Legacy accounts were created with "1234";
// the seeded backend users (V3 migration) use "Password1!" as their
// BCrypt plaintext. The mock login accepts either so old users can still
// sign in regardless of which password they originally registered with.
const MOCK_PASSWORD = "1234";
const SEED_PASSWORD = "Password1!";
const USE_MOCK = API_CONFIG.USE_MOCK;

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
  // Seed data is the fallback whenever the live API hasn't responded yet
  // (or a request failed). Keeping it as the initial state means a fresh
  // login or page reload shows the historical / seeded list immediately,
  // and `refresh()` (run on session change) replaces it with whatever
  // the backend returns. This preserves "no historical orders should
  // disappear" semantics from the original mock-only behaviour.
  const [users, setUsers] = useState<User[]>(seedUsers);
  const [products, setProducts] = useState<GasProduct[]>(seedProducts);
  const [orders, setOrders] = useState<Order[]>(seedOrders);
  const [restockRequests, setRestockRequests] = useState<RestockRequest[]>(
    seedRestockRequests,
  );
  const [permits, setPermits] = useState<PermitApplication[]>(seedPermits);
  /**
   * Live-API permits keyed by seller id. Empty in mock mode — the mock
   * branch keeps using `permits` for backwards compatibility.
   */
  const [sellerPermits, setSellerPermits] = useState<Record<string, SellerPermit>>({});
  const [notifications, setNotifications] = useState<NotificationItem[]>(
    seedNotifications,
  );
  const [complaints, setComplaints] = useState<Complaint[]>(seedComplaints);
  const [sellers, setSellers] = useState<SellerProfile[]>(seedSellers);
  const [emergencyContacts] = useState<EmergencyContact[]>(
    seedEmergencyContacts,
  );
  const [routes, setRoutes] = useState<DeliveryRoute[]>(seedRoutes);
  const [vehicles, setVehicles] = useState<Vehicle[]>(seedVehicles);
  const [riders, setRiders] = useState<Rider[]>(seedRiders);
  const [trips, setTrips] = useState<DeliveryTrip[]>(seedTrips);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);
  const refreshSequenceRef = useRef(0);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Demo-only credential memory. Each seeded user knows both the legacy
  // mock password ("1234") and the BCrypt plaintext that the live
  // backend stores ("Password1!") so login succeeds in either branch.
  const [credentials, setCredentials] = useState<Record<string, string>>(() =>
    Object.fromEntries(seedUsers.map((u) => [u.username, SEED_PASSWORD])),
  );

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
    if (USE_MOCK) return;

    const currentSession = sessionRef.current;
    if (!currentSession?.token?.trim()) {
      // Logged out — keep the seed data visible so the user doesn't see
      // an empty screen if they re-open the app while signed out. The
      // auth flow itself doesn't depend on these slices.
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
          const user = users.find(
            (u) =>
              (u.username === username || u.email === username) &&
              (credentials[username] === password ||
                MOCK_PASSWORD === password ||
                SEED_PASSWORD === password),
          );
          if (!user) throw new Error("Invalid username or password.");
          setSession({ user, token: `mock-token-${user.id}-${Date.now()}` });
          return user;
        }
        const { user, token } = await AuthApi.login({ identifier: username, password });
        setSession({ user, token });
        return user;
      });
      return data;
    },
    [run, users, credentials],
  );

  const register = useCallback(
    async (input: RegisterInput): Promise<User | null> => {
      const { data } = await run(async () => {
        if (USE_MOCK) {
          if (users.some((u) => u.username === input.username)) {
            throw new Error("Username already taken.");
          }
          const newUser: User = {
            id: `u-${Date.now()}`,
            fullName: input.fullName,
            username: input.username,
            email: input.email,
            phone: input.phone,
            role: input.role,
            createdAt: new Date().toISOString(),
          };
          setUsers((prev) => [...prev, newUser]);
          setCredentials((prev) => ({ ...prev, [input.username]: input.password }));
          setSession({
            user: newUser,
            token: `mock-token-${newUser.id}-${Date.now()}`,
          });
          return newUser;
        }
        const { user, token } = await AuthApi.register(input);
        setSession({ user, token });
        return user;
      });
      return data;
    },
    [run, users],
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
          // A rider must see every order from any seller they're
          // assigned to via `seller_riders` — both ACTIVE (PENDING,
          // ACCEPTED, ASSIGNED, PICKED_UP, IN_TRANSIT) AND terminal
          // (DELIVERED, CANCELLED, REJECTED). The selector returns
          // everything; callers compose the active-only / completed
          // slices via `.filter(status)` for screens like
          // `dashboard`, `earnings`, and `delivery-history`.
          //
          // IMPORTANT: do NOT filter by terminal status here — doing
          // so makes `completed` always empty on those screens, and
          // older active orders "disappear" the moment a new order is
          // created (history callers see nothing past the new one).
          //
          // Sorted by `updatedAt DESC` so the array is in a stable
          // order regardless of which slice the caller takes.
          const allowedSellerIds = new Set(
            sellersForRider(userId).map((id) => String(id)),
          );
          if (allowedSellerIds.size === 0) return [];
          const filtered = orders.filter((o) =>
            allowedSellerIds.has(String(o.sellerId)),
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
    const allowedSellerIds = new Set(
      sellersForRider(session.user.id).map((id) => String(id)),
    );
    if (allowedSellerIds.size === 0) {
      // Rider not assigned to any seller — empty queue is correct.
      return [];
    }
    const filtered = orders.filter(
      (o) =>
        o.status === "accepted" &&
        !o.riderId &&
        allowedSellerIds.has(String(o.sellerId)) &&
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
   * Legacy verb — kept so existing screens that hand-pick a rider
   * still work in the mock branch. Production callers should use
   * `claimOrder` instead.
   *
   * Honors the seller↔rider scoping rule: assigning a rider who isn't
   * in `seededSellerRiders[order.sellerId]` is rejected with
   * `NOT_AUTHORIZED` so the mock can't accidentally leak across
   * sellers in either branch.
   */
  const assignRider = useCallback(
    async (orderId: string, riderId: string, riderName: string) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) {
        throw new OrderServiceError("NOT_FOUND", `Order ${orderId} not found.`);
      }
      const team = seededSellerRiders[order.sellerId] ?? [];
      if (!team.includes(riderId)) {
        throw new OrderServiceError(
          "NOT_AUTHORIZED",
          `Rider ${riderId} is not assigned to ${order.sellerName}.`,
        );
      }
      if (USE_MOCK) {
        const now = new Date().toISOString();
        setOrders((prev) => {
          const nextOrders: Order[] = prev.map((o) =>
            o.id === orderId
              ? { ...o, riderId, riderName, status: "assigned", updatedAt: now }
              : o,
          );
          if (__DEV__) {
            console.info(
              "[RIDER_ORDERS][ASSIGN_RIDER]",
              JSON.stringify({
                source: "mock",
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
        setNotifications((prev) => [
          {
            id: `n-${Date.now()}-r`,
            userId: riderId,
            title: "New delivery assigned",
            message: `Order #${orderId.slice(-4)} from ${order.sellerName}`,
            type: "delivery",
            read: false,
            createdAt: now,
          },
          {
            id: `n-${Date.now()}-c`,
            userId: order.customerId,
            title: "Rider assigned",
            message: `${riderName} will deliver your order #${orderId.slice(-4)}.`,
            type: "delivery",
            read: false,
            createdAt: now,
          },
          ...prev,
        ]);
        return;
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
      form.append("type", type);
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
        const document = await PermitsApi.uploadDocument(form);
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
      const form = new FormData();
      if (license) {
        form.append("license", license.blob, license.filename);
      }
      const updated = await PermitsApi.approve(permitId, form);
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
      const updated = await UsersApi.updateProfile(session.user.id, patch);
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? updated : u)),
      );
      setSession((prev) => (prev ? { ...prev, user: updated } : prev));
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

  /** Add a new vehicle to the fleet. */
  const addVehicle = useCallback(async (input: Omit<Vehicle, "id">) => {
    const vehicle: Vehicle = { ...input, id: `v-${Date.now()}` };
    setVehicles((prev) => [...prev, vehicle]);
    return vehicle;
  }, []);

  const toggleVehicleActive = useCallback((id: string, active: boolean) => {
    setVehicles((prev) =>
      prev.map((v) => (v.id === id ? { ...v, active } : v)),
    );
  }, []);

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
      markNotificationRead,
      addComplaint,
      resolveComplaint,
      updateUserStatus,
      updateProfile,
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
      markNotificationRead,
      addComplaint,
      resolveComplaint,
      updateUserStatus,
      updateProfile,
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
