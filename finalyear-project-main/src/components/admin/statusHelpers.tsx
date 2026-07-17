/**
 * Helpers for mapping domain statuses to AdminBadge tones across the
 * dashboard. Centralised here so screens stay declarative.
 */
import React from "react";
import { AdminBadge, BadgeTone } from "./AdminBadge";

const SUPPLIER_TONE: Record<string, BadgeTone> = {
  active: "success",
  suspended: "danger",
};

const SELLER_TONE: Record<string, BadgeTone> = {
  active: "success",
  suspended: "danger",
  inactive: "neutral",
};

const APP_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

const RIDER_APPROVAL: Record<string, BadgeTone> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
};

const RIDER_STATUS: Record<string, BadgeTone> = {
  active: "success",
  inactive: "neutral",
  suspended: "danger",
};

const ASSIGNMENT_TONE: Record<string, BadgeTone> = {
  pending_seller_response: "warning",
  accepted: "success",
  rejected: "danger",
};

const ASSIGNMENT_LABEL: Record<string, string> = {
  pending_seller_response: "Pending Seller",
  accepted: "Accepted",
  rejected: "Rejected",
};

const ORDER_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  processing: "info",
  in_transit: "info",
  delivered: "success",
  cancelled: "danger",
};

export function SupplierStatusBadge({ status }: { status: string }) {
  return (
    <AdminBadge
      label={status[0].toUpperCase() + status.slice(1)}
      tone={SUPPLIER_TONE[status] ?? "neutral"}
      icon={status === "active" ? "●" : "■"}
    />
  );
}

export function SellerStatusBadge({ status }: { status: string }) {
  return (
    <AdminBadge
      label={status[0].toUpperCase() + status.slice(1)}
      tone={SELLER_TONE[status] ?? "neutral"}
    />
  );
}

export function ApplicationStatusBadge({ status }: { status: string }) {
  return (
    <AdminBadge
      label={status[0].toUpperCase() + status.slice(1)}
      tone={APP_TONE[status] ?? "neutral"}
    />
  );
}

export function RiderApprovalBadge({ status }: { status: string }) {
  return (
    <AdminBadge
      label={status[0].toUpperCase() + status.slice(1)}
      tone={RIDER_APPROVAL[status] ?? "neutral"}
    />
  );
}

export function RiderStatusBadge({ status }: { status: string }) {
  return (
    <AdminBadge
      label={status[0].toUpperCase() + status.slice(1)}
      tone={RIDER_STATUS[status] ?? "neutral"}
    />
  );
}

export function AssignmentStatusBadge({ status }: { status: string }) {
  return (
    <AdminBadge
      label={ASSIGNMENT_LABEL[status] ?? status}
      tone={ASSIGNMENT_TONE[status] ?? "neutral"}
    />
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <AdminBadge
      label={status.replace("_", " ")[0].toUpperCase() +
        status.replace("_", " ").slice(1)}
      tone={ORDER_TONE[status] ?? "neutral"}
    />
  );
}