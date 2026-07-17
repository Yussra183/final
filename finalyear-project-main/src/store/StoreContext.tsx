import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  PermitStatus,
  RestockRequest,
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

interface StoreShape {
  // Auth
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
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

const PASSWORD = "1234"; // demo only — used by the mock login
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
}

function useAsync(setLoading: (b: boolean) => void, setError: (s: string | null) => void) {
  return useCallback(
    async <T,>(fn: () => Promise<T>): Promise<AsyncResult<T>> => {
      setLoading(true);
      setError(null);
      try {
        const data = await fn();
        return { data, error: null };
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : (err as Error)?.message ?? "Something went wrong";
        setError(msg);
        return { data: null, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError],
  );
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>(USE_MOCK ? seedUsers : []);
  const [products, setProducts] = useState<GasProduct[]>(
    USE_MOCK ? seedProducts : [],
  );
  const [orders, setOrders] = useState<Order[]>(USE_MOCK ? seedOrders : []);
  const [restockRequests, setRestockRequests] = useState<RestockRequest[]>(
    USE_MOCK ? seedRestockRequests : [],
  );
  const [permits, setPermits] = useState<PermitApplication[]>(
    USE_MOCK ? seedPermits : [],
  );
  const [notifications, setNotifications] = useState<NotificationItem[]>(
    USE_MOCK ? seedNotifications : [],
  );
  const [complaints, setComplaints] = useState<Complaint[]>(
    USE_MOCK ? seedComplaints : [],
  );
  const [sellers, setSellers] = useState<SellerProfile[]>(
    USE_MOCK ? seedSellers : [],
  );
  const [emergencyContacts] = useState<EmergencyContact[]>(
    USE_MOCK ? seedEmergencyContacts : [],
  );
  const [routes, setRoutes] = useState<DeliveryRoute[]>(USE_MOCK ? seedRoutes : []);
  const [vehicles, setVehicles] = useState<Vehicle[]>(USE_MOCK ? seedVehicles : []);
  const [riders, setRiders] = useState<Rider[]>(USE_MOCK ? seedRiders : []);
  const [trips, setTrips] = useState<DeliveryTrip[]>(USE_MOCK ? seedTrips : []);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Demo-only credential memory.
  const [credentials, setCredentials] = useState<Record<string, string>>(() =>
    Object.fromEntries(seedUsers.map((u) => [u.username, PASSWORD])),
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
   * Currently the backend only exposes the auth module, so most calls
   * resolve to a failure and we simply skip those slots.
   */
  const refresh = useCallback(async () => {
    if (USE_MOCK) return;
    const results = await Promise.allSettled([
      UsersApi.list(),
      ProductsApi.list(),
      OrdersApi.list(),
      RestockApi.list(),
      PermitsApi.list(),
      NotificationsApi.list(),
      ComplaintsApi.list(),
    ]);
    const value = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
      r.status === "fulfilled" ? r.value : fallback;
    setUsers(value(results[0], []));
    setProducts(value(results[1], []));
    setOrders(value(results[2], []));
    setRestockRequests(value(results[3], []));
    setPermits(value(results[4], []));
    setNotifications(value(results[5], []));
    setComplaints(value(results[6], []));
  }, []);

  // Re-fetch after login. The auth response already carries the user,
  // so we don't *need* a refresh to render — but it's a good moment to
  // populate any lists the backend does expose.
  useEffect(() => {
    if (!USE_MOCK && session) {
      refresh().catch(() => {
        /* swallow — refresh is best-effort */
      });
    }
  }, [session, refresh]);

  // ---- Async wrapper ---------------------------------------------------
  const run = useAsync(setLoading, setError);

  // ---- Auth ------------------------------------------------------------
  const login = useCallback(
    async (username: string, password: string): Promise<User | null> => {
      const { data } = await run(async () => {
        if (USE_MOCK) {
          const user = users.find(
            (u) =>
              (u.username === username || u.email === username) &&
              credentials[username] === password,
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
  const getOrdersForUser = useCallback(
    (userId: string, role: UserRole): Order[] => {
      switch (role) {
        case "customer":
          return orders.filter((o) => o.customerId === userId);
        case "seller":
          return orders.filter((o) => o.sellerId === userId);
        case "rider":
          return orders.filter((o) => o.riderId === userId);
        case "admin":
        case "supplier":
          return orders;
        default:
          return [];
      }
    },
    [orders],
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
   * five verbs below stay focused on routing + error handling.
   */
  const applyServiceResult = useCallback(
    (next: Order, notes: NotificationItem[]) => {
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === next.id);
        if (idx === -1) return [next, ...prev];
        const copy = prev.slice();
        copy[idx] = next;
        return copy;
      });
      if (notes.length) {
        setNotifications((prev) => [...notes, ...prev]);
      }
    },
    [],
  );

  /**
   * Create a new order. In mock mode the service result is synthesised
   * locally so the existing tests / demos keep working; in real mode we
   * delegate to `OrderService.create`, which validates the payload,
   * persists via the repository, and returns the audit-notes to write.
   */
  const placeOrder = useCallback(
    async (input: PlaceOrderInput): Promise<Order> => {
      if (USE_MOCK) {
        const now = new Date().toISOString();
        const order: Order = {
          id: `o-${Date.now()}`,
          customerId: input.customerId,
          customerName: input.customerName,
          sellerId: input.sellerId,
          sellerName: input.sellerName,
          items: input.items,
          total: input.total,
          phone: input.phone,
          deliveryLocation: input.deliveryLocation,
          notes: input.notes,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };
        applyServiceResult(order, [
          {
            id: `n-${Date.now()}-s`,
            userId: input.sellerId,
            title: "New order received",
            message: `Order #${order.id.slice(-4)} from ${input.customerName}`,
            type: "order",
            read: false,
            createdAt: now,
          },
        ]);
        return order;
      }
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
   *   • order.status flips to "accepted"
   *   • every nearby rider (per `riderBroadcast`) receives an in-app
   *     notification tagged as a delivery request
   */
  const acceptOrder = useCallback(
    async (orderId: string) => {
      if (!session) throw new OrderServiceError("NOT_AUTHORIZED", "Not signed in.");
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new OrderServiceError("NOT_FOUND", "Order not found.");
      if (USE_MOCK) {
        const now = new Date().toISOString();
        const next: Order = {
          ...order,
          status: "accepted",
          updatedAt: now,
        };
        // Build a deterministic mock rider queue — one rider per
        // seeded rider user — so the demo still demonstrates the
        // proximity-based notification fan-out.
        const riders = users.filter((u) => u.role === "rider");
        const notes: NotificationItem[] = [
          {
            id: `n-${orderId}-acc-c`,
            userId: order.customerId,
            title: "Order accepted",
            message: `${order.sellerName} accepted your order #${orderId.slice(-4)}. A rider is being matched.`,
            type: "order",
            read: false,
            createdAt: now,
          },
          ...riders.map((r, i) => ({
            id: `n-${orderId}-br-${r.id}`,
            userId: r.id,
            title: i === 0 ? "Pickup near you" : "Delivery available",
            message:
              i === 0
                ? `Order #${orderId.slice(-4)} from ${order.sellerName} is closest to you.`
                : `Order #${orderId.slice(-4)} available in your area.`,
            type: "delivery" as const,
            read: false,
            createdAt: now,
          })),
        ];
        applyServiceResult(next, notes);
        return;
      }
      const result = await orderService.accept({ actor: session.user }, order);
      applyServiceResult(result.order, result.auditNotes);
    },
    [session, orders, users, applyServiceResult],
  );

  /**
   * Seller rejects a PENDING order. `reason` is optional but the UI
   * presents a modal so it's almost always supplied.
   */
  const rejectOrder = useCallback(
    async (orderId: string, reason?: string) => {
      if (!session) throw new OrderServiceError("NOT_AUTHORIZED", "Not signed in.");
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new OrderServiceError("NOT_FOUND", "Order not found.");
      if (USE_MOCK) {
        const now = new Date().toISOString();
        const next: Order = {
          ...order,
          status: "rejected",
          rejectReason: reason,
          updatedAt: now,
        };
        applyServiceResult(next, [
          {
            id: `n-${orderId}-rej-c`,
            userId: order.customerId,
            title: "Order rejected",
            message: reason
              ? `${order.sellerName} declined your order #${orderId.slice(-4)}: ${reason}`
              : `${order.sellerName} declined your order #${orderId.slice(-4)}.`,
            type: "order",
            read: false,
            createdAt: now,
          },
        ]);
        return;
      }
      const result = await orderService.reject(
        { actor: session.user, reason },
        order,
      );
      applyServiceResult(result.order, result.auditNotes);
    },
    [session, orders, applyServiceResult],
  );

  /**
   * Customer cancels a PENDING order. The seller is notified.
   */
  const cancelOrder = useCallback(
    async (orderId: string, reason?: string) => {
      if (!session) throw new OrderServiceError("NOT_AUTHORIZED", "Not signed in.");
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new OrderServiceError("NOT_FOUND", "Order not found.");
      if (USE_MOCK) {
        const now = new Date().toISOString();
        const next: Order = { ...order, status: "cancelled", updatedAt: now };
        applyServiceResult(next, [
          {
            id: `n-${orderId}-can-s`,
            userId: order.sellerId,
            title: "Customer cancelled the order",
            message: reason
              ? `Order #${orderId.slice(-4)} cancelled: ${reason}`
              : `Order #${orderId.slice(-4)} was cancelled by the customer.`,
            type: "order",
            read: false,
            createdAt: now,
          },
        ]);
        return;
      }
      const result = await orderService.cancel(
        { actor: session.user, reason },
        order,
      );
      applyServiceResult(result.order, result.auditNotes);
    },
    [session, orders, applyServiceResult],
  );

  /**
   * Rider claims an ACCEPTED order. Atomic via the rider-broadcast
   * lock; throws RIDER_BUSY if another rider won the race.
   */
  const claimOrder = useCallback(
    async (orderId: string) => {
      if (!session) throw new OrderServiceError("NOT_AUTHORIZED", "Not signed in.");
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new OrderServiceError("NOT_FOUND", "Order not found.");
      if (USE_MOCK) {
        const now = new Date().toISOString();
        // Check the in-memory lock so the demo race condition is
        // surfaced to the UI just like the live API would.
        const lockKey = `order-lock:${orderId}`;
        const existing =
          typeof globalThis !== "undefined"
            ? (globalThis as any)[lockKey]
            : undefined;
        if (existing && existing !== session.user.id) {
          throw new OrderServiceError(
            "RIDER_BUSY",
            "Another rider already accepted this delivery.",
          );
        }
        (globalThis as any)[lockKey] = session.user.id;
        const next: Order = {
          ...order,
          status: "assigned",
          riderId: session.user.id,
          riderName: session.user.fullName,
          updatedAt: now,
        };
        applyServiceResult(next, [
          {
            id: `n-${orderId}-claim-c`,
            userId: order.customerId,
            title: "Rider assigned",
            message: `${session.user.fullName} will deliver your order #${orderId.slice(-4)}.`,
            type: "delivery",
            read: false,
            createdAt: now,
          },
          {
            id: `n-${orderId}-claim-s`,
            userId: order.sellerId,
            title: "Delivery started",
            message: `${session.user.fullName} accepted order #${orderId.slice(-4)} for delivery.`,
            type: "delivery",
            read: false,
            createdAt: now,
          },
        ]);
        return;
      }
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
   * delivered).
   */
  const advanceDelivery = useCallback(
    async (
      orderId: string,
      next: "picked_up" | "in_transit" | "delivered",
    ) => {
      if (!session) throw new OrderServiceError("NOT_AUTHORIZED", "Not signed in.");
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new OrderServiceError("NOT_FOUND", "Order not found.");
      if (USE_MOCK) {
        const ts = new Date().toISOString();
        const updated: Order = { ...order, status: next, updatedAt: ts };
        const label =
          next === "picked_up"
            ? "picked up"
            : next === "in_transit"
              ? "on the way"
              : "delivered";
        const notes: NotificationItem[] = [
          {
            id: `n-${orderId}-${next}`,
            userId: order.customerId,
            title: next === "delivered" ? "Delivery complete" : "Status update",
            message:
              next === "delivered"
                ? `Order #${orderId.slice(-4)} delivered. Enjoy your gas!`
                : `Order #${orderId.slice(-4)} is now ${label}.`,
            type: next === "delivered" ? "delivery" : "order",
            read: false,
            createdAt: ts,
          },
        ];
        if (next === "delivered") {
          notes.push({
            id: `n-${orderId}-done-s`,
            userId: order.sellerId,
            title: "Order delivered",
            message: `Order #${orderId.slice(-4)} has been delivered to ${order.customerName}.`,
            type: "delivery",
            read: false,
            createdAt: ts,
          });
        }
        applyServiceResult(updated, notes);
        return;
      }
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
   * Orders the signed-in user is currently eligible to claim. For
   * riders that's any ACCEPTED order with no rider assigned. Other
   * roles return an empty list.
   */
  const availableOrdersForUser = useCallback((): Order[] => {
    if (!session) return [];
    if (session.user.role !== "rider") return [];
    return orders.filter(
      (o) => o.status === "accepted" && !o.riderId,
    );
  }, [session, orders]);

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
   */
  const assignRider = useCallback(
    async (orderId: string, riderId: string, riderName: string) => {
      if (USE_MOCK) {
        const now = new Date().toISOString();
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId
              ? { ...o, riderId, riderName, status: "assigned", updatedAt: now }
              : o,
          ),
        );
        const order = orders.find((o) => o.id === orderId);
        if (order) {
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
        }
        return;
      }
      const updated = await OrdersApi.assignRider(orderId, riderId, riderName);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
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
      const supplierId = session?.user.id ?? "u-supp-1";
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
      login,
      register,
      logout,
      refresh,
      users,
      products,
      orders,
      restockRequests,
      permits,
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
