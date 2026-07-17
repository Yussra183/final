/**
 * OrderService — the domain orchestration layer for the gas-delivery
 * order flow.
 *
 * Responsibilities:
 *   • Enforce the state machine (PENDING → ACCEPTED → ASSIGNED →
 *     PICKED_UP → IN_TRANSIT → DELIVERED, with REJECTED and CANCELLED
 *     as terminal branches).
 *   • Enforce ownership: each role can only act on orders it owns
 *     (customer/customer, seller/seller, rider/assignee or
 *     rider/eligible-for-claim).
 *   • Run payload validation up-front so the UI gets field-level
 *     errors before the network round-trip.
 *   • Write the in-app `notifications` audit trail for every
 *     transition so customer/seller/rider histories stay in sync.
 *   • Drive the rider broadcast: when the seller accepts, every
 *     nearby eligible rider is notified; the first to claim wins.
 *
 * The service is **stateless**. Callers pass in everything we need:
 *   • The acting user (`User`)
 *   • The order (or `null` for create)
 *   • A `Repo` (defaults to `httpOrderRepository`) and a `RiderBroadcast`
 *     (defaults to `defaultRiderBroadcastService`) so we can swap to a
 *     fake/in-memory repo in tests.
 *   • The notifier hook (`(notes) => void`) writes into the store's
 *     `notifications` array. We don't manage React state directly.
 *
 * Each public method returns the new `Order` (post-transition). On
 * failure it throws an `OrderServiceError` whose `code` the UI can
 * switch on.
 */
import {
  OrderServiceError,
} from "./orderErrors";
import {
  assertTransition,
  validateCreateOrderPayload,
} from "./orderValidation";
import {
  type OrderRepository,
  httpOrderRepository,
} from "./orderRepository";
import {
  type RiderBroadcastService,
  defaultRiderBroadcastService,
} from "./riderBroadcast";
import type {
  NotificationItem,
  Order,
  OrderItem,
  User,
} from "../../constants/types";

// ---- DTOs ---------------------------------------------------------------

export interface CreateOrderDto {
  customerId: string;
  customerName: string;
  sellerId: string;
  sellerName: string;
  items: OrderItem[];
  total: number;
  /** Customer-supplied phone for THIS delivery. Required. */
  phone: string;
  deliveryLocation: { address: string; lat?: number; lng?: number };
  notes?: string;
  /** Optional override; defaults to the user's id. */
  actorId?: string;
}

export interface OrderActionContext {
  actor: User;
  reason?: string;
}

/**
 * Result of any state-mutating operation. The new `Order` is what the
 * store swaps into its `orders` array; the `auditNotes` are appended to
 * the `notifications` array so customer/seller/rider history stays in
 * sync with the order's lifecycle.
 */
export interface OrderActionResult {
  order: Order;
  auditNotes: NotificationItem[];
}

// ---- Service surface ----------------------------------------------------

export interface OrderServiceOptions {
  repo?: OrderRepository;
  riderBroadcast?: RiderBroadcastService;
}

export class OrderService {
  private readonly repo: OrderRepository;
  private readonly riderBroadcast: RiderBroadcastService;

  constructor(opts: OrderServiceOptions = {}) {
    this.repo = opts.repo ?? httpOrderRepository;
    this.riderBroadcast =
      opts.riderBroadcast ?? defaultRiderBroadcastService;
  }

  // ---- Create ---------------------------------------------------------

  /**
   * Place a new order on behalf of a customer. Returns the freshly
   * created order in `pending` status. Validates fields up-front and
   * surfaces a notification to the seller so their New Orders feed
   * refreshes.
   */
  async create(dto: CreateOrderDto): Promise<OrderActionResult> {
    validateCreateOrderPayload({
      customerId: dto.customerId,
      sellerId: dto.sellerId,
      items: dto.items,
      total: dto.total,
      phone: dto.phone,
      deliveryLocation: dto.deliveryLocation,
    });
    const created = await this.repo.create({
      customerId: dto.customerId,
      customerName: dto.customerName,
      sellerId: dto.sellerId,
      sellerName: dto.sellerName,
      items: dto.items,
      total: dto.total,
      deliveryLocation: dto.deliveryLocation,
      phone: dto.phone,
      notes: dto.notes,
    });
    return {
      order: created,
      auditNotes: [
        {
          id: `n-${created.id}-placed`,
          userId: dto.sellerId,
          title: "New order received",
          message: `Order #${created.id.slice(-4)} from ${dto.customerName}`,
          type: "order",
          read: false,
          createdAt: created.createdAt,
        },
      ],
    };
  }

  // ---- Seller decisions ----------------------------------------------

  /** Seller (owner) accepts a PENDING order → ACCEPTED + rider broadcast. */
  async accept(
    ctx: OrderActionContext,
    order: Order,
  ): Promise<OrderActionResult> {
    assertTransition(ctx.actor, order, "accepted");
    if (ctx.actor.role !== "seller") {
      throw new OrderServiceError(
        "NOT_AUTHORIZED",
        "Only the seller can accept this order.",
      );
    }
    const updated = await this.repo.accept(order.id);
    // Kick off the broadcast — backend is authoritative, but locally we
    // also pre-compute the rider list to surface "nearest" in the
    // notification message we write to each rider's feed.
    const riders = await this.riderBroadcast.eligibleRidersForOrder(updated);
    const nearestName = riders[0]?.fullName ?? "a nearby rider";
    const now = new Date().toISOString();
    return {
      order: updated,
      auditNotes: [
        {
          id: `n-${order.id}-accepted-c`,
          userId: updated.customerId,
          title: "Order accepted",
          message: `${updated.sellerName} accepted your order #${updated.id.slice(-4)}. A rider is being matched.`,
          type: "order",
          read: false,
          createdAt: now,
        },
        ...riders.map((r) => ({
          id: `n-${order.id}-broadcast-${r.id}`,
          userId: r.id,
          title: "New delivery request",
          message:
            r.fullName === nearestName
              ? `Pickup near you — order #${updated.id.slice(-4)}`
              : `Order #${updated.id.slice(-4)} available in your area`,
          type: "delivery" as const,
          read: false,
          createdAt: now,
        })),
      ],
    };
  }

  /** Seller (owner) rejects a PENDING order → REJECTED + reason captured. */
  async reject(
    ctx: OrderActionContext,
    order: Order,
  ): Promise<OrderActionResult> {
    assertTransition(ctx.actor, order, "rejected");
    if (ctx.actor.role !== "seller") {
      throw new OrderServiceError(
        "NOT_AUTHORIZED",
        "Only the seller can reject this order.",
      );
    }
    const updated = await this.repo.reject(order.id, ctx.reason);
    const now = new Date().toISOString();
    return {
      order: updated,
      auditNotes: [
        {
          id: `n-${order.id}-rejected`,
          userId: updated.customerId,
          title: "Order rejected",
          message: ctx.reason
            ? `${updated.sellerName} declined your order #${updated.id.slice(-4)}: ${ctx.reason}`
            : `${updated.sellerName} declined your order #${updated.id.slice(-4)}.`,
          type: "order",
          read: false,
          createdAt: now,
        },
      ],
    };
  }

  // ---- Customer cancel -----------------------------------------------

  /** Customer cancels a PENDING order before the seller acts. */
  async cancel(
    ctx: OrderActionContext,
    order: Order,
  ): Promise<OrderActionResult> {
    assertTransition(ctx.actor, order, "cancelled");
    if (ctx.actor.role !== "customer") {
      throw new OrderServiceError(
        "NOT_AUTHORIZED",
        "Only the customer can cancel a pending order.",
      );
    }
    const updated = await this.repo.cancel(order.id, ctx.reason);
    const now = new Date().toISOString();
    return {
      order: updated,
      auditNotes: [
        {
          id: `n-${order.id}-cancelled`,
          userId: updated.sellerId,
          title: "Customer cancelled the order",
          message: ctx.reason
            ? `Order #${updated.id.slice(-4)} cancelled: ${ctx.reason}`
            : `Order #${updated.id.slice(-4)} was cancelled by the customer.`,
          type: "order",
          read: false,
          createdAt: now,
        },
      ],
    };
  }

  // ---- Rider claim ---------------------------------------------------

  /**
   * A rider self-assigns the next available order. The repository is
   * responsible for the atomic `SETNX` lock; on contention it returns a
   * 409 and we throw `RIDER_BUSY`.
   */
  async claim(
    ctx: OrderActionContext,
    order: Order,
  ): Promise<OrderActionResult> {
    if (ctx.actor.role !== "rider") {
      throw new OrderServiceError(
        "NOT_AUTHORIZED",
        "Only riders can claim deliveries.",
      );
    }
    assertTransition(ctx.actor, order, "assigned");
    // Local eligibility check — mirrors the server's intent.
    await this.riderBroadcast.claimForRider(order.id, {
      id: ctx.actor.id,
      fullName: ctx.actor.fullName,
      phone: ctx.actor.phone,
      status: "online",
      available: true,
      lat: 0,
      lng: 0,
    });
    const updated = await this.repo.claim(
      order.id,
      ctx.actor.id,
      ctx.actor.fullName,
    );
    const now = new Date().toISOString();
    return {
      order: updated,
      auditNotes: [
        {
          id: `n-${order.id}-claim-c`,
          userId: updated.customerId,
          title: "Rider assigned",
          message: `${ctx.actor.fullName} will deliver your order #${updated.id.slice(-4)}.`,
          type: "delivery",
          read: false,
          createdAt: now,
        },
        {
          id: `n-${order.id}-claim-s`,
          userId: updated.sellerId,
          title: "Delivery started",
          message: `${ctx.actor.fullName} accepted order #${updated.id.slice(-4)} for delivery.`,
          type: "delivery",
          read: false,
          createdAt: now,
        },
      ],
    };
  }

  // ---- Rider progress ------------------------------------------------

  /**
   * Rider advances the delivery. The state machine enforces the order
   * of transitions; anything out of order throws `INVALID_TRANSITION`.
   * Supports `picked_up` / `in_transit` / `delivered`.
   */
  async advance(
    ctx: OrderActionContext,
    order: Order,
    next: "picked_up" | "in_transit" | "delivered",
  ): Promise<OrderActionResult> {
    assertTransition(ctx.actor, order, next);
    if (ctx.actor.role !== "rider") {
      throw new OrderServiceError(
        "NOT_AUTHORIZED",
        "Only the assigned rider can advance delivery.",
      );
    }
    const updated = await this.repo.updateStatus(order.id, next, ctx.reason);
    const now = new Date().toISOString();
    const label =
      next === "picked_up"
        ? "Picked up"
        : next === "in_transit"
          ? "On the way"
          : "Delivered";
    const notes: NotificationItem[] = [
      {
        id: `n-${order.id}-${next}`,
        userId: updated.customerId,
        title: `Delivery ${label.toLowerCase()}`,
        message:
          next === "delivered"
            ? `Order #${updated.id.slice(-4)} delivered. Enjoy your gas!`
            : `Order #${updated.id.slice(-4)} is now ${label.toLowerCase()}.`,
        type: next === "delivered" ? "delivery" : "order",
        read: false,
        createdAt: now,
      },
    ];
    if (next === "delivered") {
      notes.push({
        id: `n-${order.id}-delivered-s`,
        userId: updated.sellerId,
        title: "Order delivered",
        message: `Order #${updated.id.slice(-4)} has been delivered to ${updated.customerName}.`,
        type: "delivery",
        read: false,
        createdAt: now,
      });
    }
    return { order: updated, auditNotes: notes };
  }

  // ---- Queries -------------------------------------------------------

  /**
   * Orders that are eligible for `actor` to claim right now. Backs
   * the rider's "Available" tab. We return whatever the repository
   * reports in `accepted` status filtered by role-eligibility so the
   * UI never shows orders the actor can't act on.
   */
  async availableForRider(actor: User): Promise<Order[]> {
    if (actor.role !== "rider") return [];
    const list = await this.repo.availableForRiders({});
    return list.filter((o) => o.status === "accepted" && !o.riderId);
  }

  /**
   * Read the order timeline (audit history). The store builds this
   * from the `notifications` list on demand; the service is here for
   * any future backend endpoint that returns a server-side timeline.
   */
  timeline(order: Order): Array<{ status: Order["status"]; at: string }> {
    const now = order.updatedAt;
    const created = order.createdAt;
    switch (order.status) {
      case "pending":
        return [{ status: "pending", at: created }];
      case "accepted":
        return [
          { status: "pending", at: created },
          { status: "accepted", at: now },
        ];
      case "assigned":
        return [
          { status: "pending", at: created },
          { status: "accepted", at: now },
          { status: "assigned", at: now },
        ];
      case "picked_up":
        return [
          { status: "pending", at: created },
          { status: "accepted", at: now },
          { status: "assigned", at: now },
          { status: "picked_up", at: now },
        ];
      case "in_transit":
        return [
          { status: "pending", at: created },
          { status: "accepted", at: now },
          { status: "assigned", at: now },
          { status: "picked_up", at: now },
          { status: "in_transit", at: now },
        ];
      case "delivered":
        return [
          { status: "pending", at: created },
          { status: "accepted", at: now },
          { status: "assigned", at: now },
          { status: "picked_up", at: now },
          { status: "in_transit", at: now },
          { status: "delivered", at: now },
        ];
      case "cancelled":
      case "rejected":
        return [
          { status: "pending", at: created },
          { status: order.status, at: now },
        ];
    }
  }
}

/** Default singleton — the store constructs one on mount. */
export const orderService = new OrderService();
