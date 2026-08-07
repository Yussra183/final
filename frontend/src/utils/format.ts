import { OrderStatus, PermitStatus } from "../../constants/types";
import {
  orderStatusLabel as _specOrderStatusLabel,
  orderTone as _specOrderTone,
} from "../../constants/order";

export const formatCurrency = (n: number) => {
  const v = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `TSh ${v}`;
};

export const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Back-compat shims around the canonical helpers in `constants/order.ts`.
 * The new helpers use the spec vocabulary — "Accepted" instead of
 * "Confirmed", "Rejected" instead of merging into "Cancelled", and
 * "On the Way" instead of "In Transit".
 *
 * Existing screens keep working without rewrites; new screens should
 * prefer the `constants/order` exports directly so the type stays
 * strictly `OrderStatus`.
 */
export const orderStatusLabel = (s: OrderStatus) => _specOrderStatusLabel(s);
/**
 * Visual tone for a status. Returned as `any` only because the legacy
 * `StatusPill` expects a union that predates `Tone`. The runtime values
 * are identical to those from `constants/order.orderTone`.
 *
 * @deprecated prefer `orderTone` from `constants/order` in new code.
 */
export const orderTone = (s: OrderStatus): any => _specOrderTone(s);

export const permitTone = (s: PermitStatus) => {
  switch (s) {
    case "approved":
      return "success" as const;
    case "rejected":
      return "danger" as const;
    case "pending":
    case "draft":
      return "warning" as const;
  }
};

export const roleHome = (role: string) => {
  switch (role) {
    case "customer":
      return "/(customer)" as const;
    case "seller":
      // Land sellers directly on the dedicated Seller Dashboard (drawer
      // route). Falls back to /(seller) if the dedicated dashboard route
      // is missing for some reason.
      return "/seller/dashboard" as const;
    case "supplier":
      // Land suppliers directly on the dashboard file inside the
      // (supplier) Drawer group, instead of routing through the group's
      // index page. The group has no `index.tsx` (its role-specific
      // landing is the supplier logistics dashboard), so navigating to
      // the bare `/(supplier)` would resolve to "Unmatched Route".
      // Matches the direct-file pattern used for seller / rider / admin.
      return "/(supplier)/dashboard" as const;
    case "rider":
      return "/rider/dashboard" as const;
    case "admin":
      // Land admins directly on the dashboard file inside the (admin)
      // Drawer group, instead of routing through the group's index page.
      // The (admin)/index.tsx route still exists for direct navigation /
      // deep links and forwards to "/dashboard", but skipping it on the
      // login path removes one navigation tick and prevents the Drawer
      // shell from appearing with an empty scene before the dashboard
      // mounts. Matches the direct-file pattern used for seller/rider.
      return "/(admin)/dashboard" as const;
    default:
      return "/auth/login" as const;
  }
};
