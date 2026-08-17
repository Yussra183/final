/**
 * src/hooks/useCustomerLocation.ts
 *
 * Customer-specific thin wrapper over `useDeviceLocation`. The
 * underlying hook resolves device GPS first, then a caller-supplied
 * fallback (defaults to Zanzibar centre). This wrapper layers the
 * customer's saved profile address into the fallback chain so the
 * "You" pin on the customer Home shows the saved address when the
 * device hasn't returned a fix yet (the most common case after a
 * cold start with permission denied).
 *
 * Resolution order:
 *
 *   1. Device GPS  — handled by `useDeviceLocation`.
 *   2. Saved profile address — `session.user.lat` / `.lng`, loaded
 *      once after login from `GET /api/customers/me`.
 *   3. Zanzibar default — `ZANZIBAR_CENTRE` (the underlying hook's
 *      own fallback).
 *
 * The hook never WRITES device coordinates back into the session.
 * The customer's saved address is a profile-level field that they
 * would expect to survive across sessions; silently overwriting it
 * with a transient device fix is the kind of behaviour that
 * surprises users into contacting support.
 *
 * Use the result for UI placement only — do NOT derive the radius-
 * filtered seller query from `source === "device"`. The existing
 * `useNearbySellers` hook is the canonical way to get the
 * recommendation list and it only refetches when `session.user.lat`
 * / `.lng` change.
 */
import { useDeviceLocation } from "./useDeviceLocation";
import { useStore } from "../store/StoreContext";
import type { UseDeviceLocationResult } from "./useDeviceLocation";

export type CustomerLocationSource = "device" | "profile" | "default";

export interface UseCustomerLocationResult {
  /** The resolved coordinates — never `null`. */
  coords: { lat: number; lng: number };
  /** Which strategy won. */
  source: CustomerLocationSource;
  /**
   * True while the device-GPS race is still pending. Useful for
   * showing a "locating…" affordance over the map.
   */
  loading: boolean;
  /** Optional error string; only set when something went wrong AND we want to log it. */
  error?: string;
  /**
   * Force a fresh device fix (re-runs the permission + GPS race and,
   * if granted, restarts the watch subscription). The customer Home's
   * "Locate me" FAB uses this so the camera recentres onto the
   * *current* device position rather than a stale profile address.
   */
  refresh: () => Promise<void>;
}

interface UseCustomerLocationOptions {
  /** Override the GPS-fix timeout (ms). */
  timeoutMs?: number;
  /** Override the fallback centre. Defaults to `ZANZIBAR_CENTRE`. */
  fallback?: { lat: number; lng: number };
}

/**
 * Thin customer-side wrapper: layer `session.user.lat/lng` on top
 * of the device-fallback chain so the customer Home can show the
 * saved address when no device fix is available yet.
 *
 * The wrapper deliberately disables the underlying
 * `watchPositionAsync` subscription. The customer Home only needs a
 * single foreground fix to (a) draw the "You" pin and (b) seed the
 * radius-filtered seller query. A continuous watch would jitter the
 * pin on every GPS update and trigger pointless React re-renders
 * even when the device hasn't actually moved (the underlying hook's
 * 5 m deadband doesn't help when the customer's first paint hasn't
 * settled yet). "Locate me" still calls `refresh()` to re-resolve
 * a fresh fix on demand.
 */
export function useCustomerLocation(
  options: UseCustomerLocationOptions = {},
): UseCustomerLocationResult {
  const { session } = useStore();
  const customer = session?.user;

  const hasProfile =
    typeof customer?.lat === "number" &&
    Number.isFinite(customer.lat) &&
    typeof customer?.lng === "number" &&
    Number.isFinite(customer.lng);

  // If the caller didn't supply a fallback, prefer the profile
  // address over the Zanzibar default. The underlying hook will
  // hand back device coords as soon as the GPS race resolves,
  // overriding the profile position automatically.
  const fallback =
    options.fallback ??
    (hasProfile
      ? { lat: customer!.lat as number, lng: customer!.lng as number }
      : undefined);

  const device: UseDeviceLocationResult = useDeviceLocation({
    timeoutMs: options.timeoutMs,
    fallback,
    // Customer side never needs a continuous GPS stream — see the
    // file header. Seller / rider hooks still opt in by default.
    enableWatch: false,
  });

  // Translate the underlying "device" / "fallback" source into the
  // customer-specific vocabulary. When no override fallback was
  // passed, "fallback" resolves to the customer profile when one
  // exists, otherwise to Zanzibar.
  let source: CustomerLocationSource;
  if (device.source === "device") {
    source = "device";
  } else if (options.fallback) {
    source = "default";
  } else if (hasProfile) {
    source = "profile";
  } else {
    source = "default";
  }

  return {
    coords: device.coords,
    source,
    loading: device.loading,
    error: device.error,
    refresh: device.refresh,
  };
}