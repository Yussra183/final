/**
 * Canonical state machine + display labels for the Order Flow.
 *
 * This file owns the single source of truth for:
 *   • which `OrderStatus` follows which
 *   • which role is allowed to drive the transition
 *   • human-readable labels and visual tones
 *
 * Keep the table in sync with the project spec
 * (PENDING → ACCEPTED → ASSIGNED → PICKED_UP → ON_THE_WAY → DELIVERED,
 * with REJECTED as the seller's terminal decline state, CANCELLED as the
 * customer's terminal withdraw state).
 */
import type { OrderStatus, UserRole } from "./types";

/** Statuses that mean "no further transitions are allowed". */
export const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "delivered",
  "cancelled",
  "rejected",
]);

/** A status is "active" if it can still be advanced. */
export const isTerminalStatus = (s: OrderStatus) => TERMINAL_STATUSES.has(s);

/** Roles allowed to drive each transition. Customer/seller/rider only. */
export type ActorRole = Extract<UserRole, "customer" | "seller" | "rider">;

export interface TransitionRule {
  from: OrderStatus;
  to: OrderStatus;
  /** Roles that are allowed to fire this transition. */
  actors: ReadonlyArray<ActorRole>;
}

/**
 * Allowed transitions. The UI/service consults this map instead of
 * maintaining its own status list, so adding a new state is a one-liner.
 */
export const ORDER_TRANSITIONS: ReadonlyArray<TransitionRule> = [
  // Seller decisions on a pending order.
  { from: "pending", to: "accepted", actors: ["seller"] },
  { from: "pending", to: "rejected", actors: ["seller"] },
  // Customer withdraws before the seller acts.
  { from: "pending", to: "cancelled", actors: ["customer"] },
  // A rider claims an accepted order.
  { from: "accepted", to: "assigned", actors: ["rider"] },
  // Rider updates delivery progress.
  { from: "assigned", to: "picked_up", actors: ["rider"] },
  { from: "picked_up", to: "in_transit", actors: ["rider"] },
  { from: "in_transit", to: "delivered", actors: ["rider"] },
];

/** Find the rule for a given (from, to) pair, if any. */
export function findTransition(
  from: OrderStatus,
  to: OrderStatus,
): TransitionRule | undefined {
  return ORDER_TRANSITIONS.find((r) => r.from === from && r.to === to);
}

/** Whether the given (actor, from, to) is an allowed transition. */
export function canTransition(
  actorRole: ActorRole,
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  const rule = findTransition(from, to);
  return !!rule && rule.actors.includes(actorRole);
}

/**
 * Human-readable label for a status. The spec uses "ON_THE_WAY" for what
 * the lifecycle names `in_transit`; we expose the friendly label here.
 */
export const orderStatusLabel = (s: OrderStatus): string => {
  switch (s) {
    case "pending":
      return "Pending";
    case "accepted":
      return "Accepted";
    case "assigned":
      return "Rider Assigned";
    case "picked_up":
      return "Picked Up";
    case "in_transit":
      return "On the Way";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    case "rejected":
      return "Rejected";
  }
};

/** Visual tone used by `StatusPill`. Aligned to the pill's accepted keys. */
export type Tone = "primary" | "success" | "warning" | "danger" | "info" | "muted";
export const orderTone = (s: OrderStatus): Tone => {
  switch (s) {
    case "pending":
      return "warning";
    case "accepted":
    case "assigned":
      return "info";
    case "picked_up":
    case "in_transit":
      return "primary";
    case "delivered":
      return "success";
    case "cancelled":
    case "rejected":
      return "danger";
  }
};

/**
 * Ordered lifecycle used by the timeline UI. Terminal branches are
 * rendered as separate final steps so the history still tells a story.
 */
export const ORDER_TIMELINE: ReadonlyArray<{
  key: OrderStatus;
  label: string;
}> = [
  { key: "pending", label: "Order placed" },
  { key: "accepted", label: "Seller accepted" },
  { key: "assigned", label: "Rider assigned" },
  { key: "picked_up", label: "Gas picked up" },
  { key: "in_transit", label: "On the way" },
  { key: "delivered", label: "Delivered" },
];

/**
 * Index of a status inside `ORDER_TIMELINE`. Terminal exits (cancelled,
 * rejected) intentionally return -1 — the timeline component branches on
 * negative indices to render the failure path separately.
 */
export const timelineIndexOf = (s: OrderStatus): number => {
  const idx = ORDER_TIMELINE.findIndex((t) => t.key === s);
  return idx;
};
