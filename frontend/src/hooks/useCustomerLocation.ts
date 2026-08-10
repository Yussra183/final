/**
 * src/hooks/useCustomerLocation.ts
 *
 * Resolve the customer's current location for map placement. The
 * resolution order is:
 *
 *   1. Device GPS  — `resolveCurrentDeviceCoords()` on mount. Resolves
 *      to `null` on denial, timeout, web (where expo-location is
 *      unavailable), or any error.
 *   2. Saved profile address — `session.user.lat` / `.lng`, loaded
 *      once after login from `GET /api/customers/me`.
 *   3. Zanzibar default — `ZANZIBAR_CENTRE` from `constants/zanzibar.ts`.
 *
 * The hook is INTENTIONALLY passive:
 *
 *   - It calls the device GPS resolver ONCE on mount. It never re-runs
 *     when `session.user.lat/lng` change, and it never triggers a
 *     permission dialog at the user. `expo-location` itself shows the
 *     system permission prompt the first time its foreground API is
 *     invoked; the rest of the app gates that prompt behind explicit
 *     user actions ("Use my location" / "Save").
 *   - The hook never WRITES device coordinates back into the
 *     session. The customer's saved address is a profile-level field
 *     that they would expect to survive across sessions; silently
 *     overwriting it with a transient device fix is the kind of
 *     behaviour that surprises users into contacting support.
 *
 * Use the result for UI placement only — do NOT derive the radius-
 * filtered seller query from `source === "device"`. The existing
 * `useNearbySellers` hook is the canonical way to get the
 * recommendation list and it only refetches when `session.user.lat` /
 * `.lng` change. (A device-GPS-driven refetch is a deliberate follow-
 * up; the data path today is "saved address only".)
 */
import { useEffect, useState } from "react";
import {
  resolveCurrentDeviceCoords,
  type ResolvedDeviceCoords,
} from "../lib/deviceLocation";
import { ZANZIBAR_CENTRE } from "../../constants/zanzibar";
import { useStore } from "../store/StoreContext";

/** Which resolution strategy actually supplied the coordinates. */
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
}

interface UseCustomerLocationOptions {
  /** Override the GPS-fix timeout (ms). Defaults to the device helper's 8s default. */
  timeoutMs?: number;
  /** Override the fallback centre. Defaults to `ZANZIBAR_CENTRE`. */
  fallback?: { lat: number; lng: number };
}

export function useCustomerLocation(
  options: UseCustomerLocationOptions = {},
): UseCustomerLocationResult {
  const timeoutMs = options.timeoutMs;
  const fallback = options.fallback ?? ZANZIBAR_CENTRE;
  const { session } = useStore();
  const customer = session?.user;

  const [device, setDevice] = useState<ResolvedDeviceCoords | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const coords = await resolveCurrentDeviceCoords({ timeoutMs });
        if (!cancelled) setDevice(coords);
      } catch {
        // resolveCurrentDeviceCoords never throws, but defensive null
        // is fine here too.
        if (!cancelled) setDevice(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timeoutMs]);

  // Decide which resolution wins. Device first; then saved profile;
  // then the explicit fallback.
  if (device) {
    return { coords: device, source: "device", loading: false };
  }
  if (
    typeof customer?.lat === "number" &&
    Number.isFinite(customer.lat) &&
    typeof customer?.lng === "number" &&
    Number.isFinite(customer.lng)
  ) {
    return {
      coords: { lat: customer.lat, lng: customer.lng },
      source: "profile",
      loading,
    };
  }
  return { coords: fallback, source: "default", loading };
}
