/**
 * src/lib/payment.ts
 *
 * Helpers for rendering payment status (Paid / Pending / Failed / Refunded)
 * consistently across the customer and seller dashboards.
 *
 * Two paths feed into the UI:
 *
 *   1. The live `Payment` row from `GET /api/payments/{mine,order/latest}` —
 *      used by the customer "My Payments" tab and the order detail sheet.
 *      Source of truth for the badge.
 *
 *   2. The derived status computed from an `Order.status` for screens that
 *      haven't yet loaded the live payment (e.g. the seller order list
 *      while the order is still in flight). This is a customer-side
 *      approximation only — see {@link derivePaymentStatus}.
 */
import { OrderStatus, PaymentStatus } from "../../constants/types";

export type { PaymentStatus };

export const paymentTone = (s: PaymentStatus) => {
  switch (s) {
    case "completed":
      return "success" as const;
    case "pending":
      return "warning" as const;
    case "failed":
      return "danger" as const;
    case "refunded":
      return "muted" as const;
  }
};

export const paymentStatusLabel = (s: PaymentStatus) => {
  switch (s) {
    case "completed":
      return "Paid";
    case "pending":
      return "Pending";
    case "failed":
      return "Failed";
    case "refunded":
      return "Refunded";
  }
};

/**
 * Human-readable label for a payment method. Used by the customer "My
 * Payments" list and the seller dashboard tile so a CASH row doesn't
 * render as the literal string "CASH".
 */
export const paymentMethodLabel = (m: string): string => {
  switch (m) {
    case "cash":
      return "Cash on delivery";
    case "mpesa":
      return "M-Pesa";
    case "card":
      return "Card";
    case "bank":
      return "Bank transfer";
    default:
      return m.toUpperCase();
  }
};

/**
 * Derive a payment status from the delivery status. Used as a fallback
 * when no `Payment` row is loaded yet — the live status from the
 * backend is authoritative and should be preferred when available.
 */
export function derivePaymentStatus(orderStatus: OrderStatus): PaymentStatus {
  switch (orderStatus) {
    case "delivered":
      return "completed";
    case "cancelled":
    case "rejected":
      return "refunded";
    case "pending":
    case "accepted":
    case "assigned":
    case "picked_up":
    case "in_transit":
      return "pending";
  }
}
