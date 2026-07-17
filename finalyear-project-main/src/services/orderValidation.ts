/**
 * Pure validation + authorization helpers used by both the screen
 * form (fast inline feedback) and the `OrderService` (defence-in-depth
 * at the state-machine boundary).
 *
 * Anything here is synchronous, side-effect-free, and stateless. The
 * service enforces the same checks; running them ahead of the service
 * call lets the UI surface field-level errors without a round-trip.
 */
import { canTransition } from "../../constants/order";
import type {
  Order,
  OrderItem,
  OrderStatus,
  User,
} from "../../constants/types";
import { isPhone } from "../utils/validators";
import { OrderServiceError, OrderValidationError } from "./orderErrors";

/**
 * Validates a `CreateOrderDto` at form-submit time. Throws the first
 * failing check as an `OrderValidationError` so the UI can pinpoint
 * the field.
 */
export function validateCreateOrderPayload(input: {
  customerId: string;
  sellerId: string;
  items: OrderItem[];
  total: number;
  phone?: string;
  deliveryLocation: { address: string };
  sellerActive?: boolean;
  /** Map of productId → current stock. Caller passes in from the store. */
  productStock?: Record<string, number>;
}): void {
  if (!input.customerId) {
    throw new OrderValidationError(
      "NOT_AUTHORIZED",
      "customer",
      "Customer not signed in.",
    );
  }
  if (!input.sellerId) {
    throw new OrderValidationError("NOT_FOUND", "seller", "Select a seller.");
  }
  if (input.sellerActive === false) {
    throw new OrderValidationError(
      "SELLER_NOT_ACTIVE",
      "seller",
      "This seller is not accepting orders right now.",
    );
  }
  if (!input.items || input.items.length === 0) {
    throw new OrderValidationError(
      "INVALID_QUANTITY",
      "items",
      "Your cart is empty.",
    );
  }
  for (const it of input.items) {
    if (!it.quantity || it.quantity < 1) {
      throw new OrderValidationError(
        "INVALID_QUANTITY",
        "items",
        "Quantity must be at least 1.",
      );
    }
    const stock = input.productStock?.[it.productId];
    if (typeof stock === "number" && it.quantity > stock) {
      throw new OrderValidationError(
        "OUT_OF_STOCK",
        "items",
        `Only ${stock} in stock for ${it.productName}.`,
      );
    }
  }
  if (!input.phone || !isPhone(input.phone)) {
    throw new OrderValidationError(
      "INVALID_PHONE",
      "phone",
      "A valid phone number is required.",
    );
  }
  if (!input.deliveryLocation.address?.trim()) {
    throw new OrderValidationError(
      "INVALID_ADDRESS",
      "address",
      "Delivery address is required.",
    );
  }
  if (!Number.isFinite(input.total) || input.total < 0) {
    throw new OrderValidationError(
      "INVALID_QUANTITY",
      "total",
      "Order total is invalid.",
    );
  }
}

/**
 * Throws when the requested status transition is illegal. Catches both
 * "no rule for that pair" and "rule exists but the actor can't fire it".
 */
export function assertTransition(
  actor: { role: User["role"]; id: string },
  order: Order,
  next: OrderStatus,
): void {
  const actorRole = actor.role as
    | "customer"
    | "seller"
    | "rider"
    | "admin"
    | "supplier";
  if (actorRole === "admin" || actorRole === "supplier") {
    throw new OrderServiceError(
      "NOT_AUTHORIZED",
      "Admin/supplier accounts cannot drive order status.",
    );
  }
  if (!canTransition(actorRole, order.status, next)) {
    throw new OrderServiceError(
      "INVALID_TRANSITION",
      `Cannot move order from ${order.status} to ${next} as ${actorRole}.`,
    );
  }
  // Ownership rules sit beside the transition rule so the audit story is
  // complete: only the rightful counterparty may advance.
  if (actorRole === "customer" && order.customerId !== actor.id) {
    throw new OrderServiceError(
      "NOT_AUTHORIZED",
      "You can only act on your own orders.",
    );
  }
  if (actorRole === "seller" && order.sellerId !== actor.id) {
    throw new OrderServiceError(
      "NOT_AUTHORIZED",
      "You can only act on orders assigned to your shop.",
    );
  }
  if (
    actorRole === "rider" &&
    next !== "assigned" /* claim still allowed to unknowns */ &&
    order.riderId !== actor.id
  ) {
    throw new OrderServiceError(
      "NOT_AUTHORIZED",
      "You can only update deliveries assigned to you.",
    );
  }
}

/**
 * Coarse "can this user even see this order" check. Used by selectors
 * to decide whether an item belongs in the user's list. Mirrors the
 * `OrderService` checks — UI should treat the two as equivalent.
 */
export function isOrderVisibleTo(user: User, order: Order): boolean {
  switch (user.role) {
    case "customer":
      return order.customerId === user.id;
    case "seller":
      return order.sellerId === user.id;
    case "rider":
      // Riders see orders they have claimed OR orders they are still
      // eligible to claim (i.e. accepted with no rider).
      return (
        order.riderId === user.id ||
        (order.status === "accepted" && !order.riderId)
      );
    case "admin":
    case "supplier":
      // Admin/supplier shouldn't be in the customer order flow. If we
      // do grant visibility it's read-only.
      return true;
  }
}
