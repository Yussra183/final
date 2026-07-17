/**
 * src/lib/payment.ts
 *
 * Helpers for deriving a payment status from an order's lifecycle
 * status. Until the backend exposes a real `paymentStatus` field we
 * compute it deterministically so the customer UI can render
 * consistent "Paid / Pending / Refunded" indicators alongside the
 * delivery status pill.
 */
import { OrderStatus } from "../../constants/types";

export type PaymentStatus = "paid" | "pending" | "refunded";

export const paymentTone = (s: PaymentStatus) => {
  switch (s) {
    case "paid":
      return "success" as const;
    case "pending":
      return "warning" as const;
    case "refunded":
      return "muted" as const;
  }
};

export const paymentStatusLabel = (s: PaymentStatus) => {
  switch (s) {
    case "paid":
      return "Paid";
    case "pending":
      return "Pending";
    case "refunded":
      return "Refunded";
  }
};

/**
 * Derive a payment status from the delivery status. This is a
 * customer-side approximation: a delivered order is considered paid
 * on completion, a cancelled order is refunded, anything in flight is
 * pending. Order status is still authoritative — backend wiring can
 * override later by reading a real `paymentStatus` field.
 */
export function derivePaymentStatus(orderStatus: OrderStatus): PaymentStatus {
  switch (orderStatus) {
    case "delivered":
      return "paid";
    case "cancelled":
      // Customer-driven cancel — payment hasn't gone through yet, but
      // if it had, the order would be refunded. We keep "refunded" so
      // existing UI cues still read correctly.
      return "refunded";
    case "rejected":
      // Seller rejection — same refund semantics as a cancel.
      return "refunded";
    case "pending":
    case "accepted":
    case "assigned":
    case "picked_up":
    case "in_transit":
      return "pending";
  }
}
