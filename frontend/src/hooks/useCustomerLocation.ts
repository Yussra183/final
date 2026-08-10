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
 * Once the initial fix returns a real device position, the hook
 * subscribes to `Location.watchPositionAsync` so the "You" pin on the
 * customer Home map keeps moving as the customer moves. The
 * subscription is throttled to one update per 3 s and 5 m of travel —
 * matches the rider-side `useRiderGps` cadence and the backend's
 * position-dedup threshold, so React doesn't re-render faster than the
 * server would have consumed the sample anyway.
 *
 * The hook never WRITES device coordinates back into the session. The
 * customer's saved address is a profile-level field that they would
 * expect to survive across sessions; silently overwriting it with a
 * transient device fix is the kind of behaviour that surprises users
 * into contacting support.
 *
 * Use the result for UI placement only — do NOT derive the radius-
 * filtered seller query from `source === "device"`. The existing
 * `useNearbySellers` hook is the canonical way to get the
 * recommendation list and it only refetches when `session.user.lat` /
 * `.lng` change. (A device-GPS-driven refetch is a deliberate follow-
 * up; the data path today is "saved address only".)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import type { LocationObject, LocationSubscription } from "expo-location";
import {
  resolveCurrentDeviceCoords,
  type ResolvedDeviceCoords,
} from "../lib/deviceLocation";
import { haversineMeters } from "../lib/location";
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
  /**
   * Force a fresh device fix (re-runs the permission + GPS race and,
   * if granted, restarts the watch subscription). The customer Home's
   * "Locate me" FAB uses this so the camera recentres onto the
   * *current* device position rather than a stale profile address.
   *
   * Safe to call repeatedly; no-op while a refresh is already in
   * flight.
   */
  refresh: () => Promise<void>;
}

interface UseCustomerLocationOptions {
  /** Override the GPS-fix timeout (ms). Defaults to the device helper's 8s default. */
  timeoutMs?: number;
  /** Override the fallback centre. Defaults to `ZANZIBAR_CENTRE`. */
  fallback?: { lat: number; lng: number };
}

/** Match `useRiderGps` cadence so the UI cadence stays consistent. */
const WATCH_INTERVAL_MS = 3_000;
const WATCH_DISTANCE_M = 5;

/**
 * Run the initial one-shot GPS race. Extracted so `refresh()` can call
 * the same path without duplicating the cancellation / loading dance.
 */
function useInitialFix(
  timeoutMs: number | undefined,
  onResolved: (coords: ResolvedDeviceCoords | null) => void,
) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const coords = await resolveCurrentDeviceCoords({ timeoutMs });
        if (!cancelled) onResolved(coords);
      } catch {
        if (!cancelled) onResolved(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // onResolved is intentionally stable (the setter) so we don't loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutMs]);
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
  const [refreshTick, setRefreshTick] = useState(0);

  // Mutable refs so the watch callback closes over the latest values
  // without re-creating the subscription on every state change.
  const deviceRef = useRef<ResolvedDeviceCoords | null>(null);
  const lastEmittedRef = useRef<ResolvedDeviceCoords | null>(null);
  const subRef = useRef<LocationSubscription | null>(null);

  deviceRef.current = device;

  /**
   * Begin a `watchPositionAsync` subscription against the device
   * coordinates we just resolved. No-op if permission was denied /
   * unsupported (caller should have passed `null` in that case).
   */
  const startWatch = useCallback(async () => {
    // Already watching? leave the existing subscription alone.
    if (subRef.current) return;
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") return;
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: WATCH_INTERVAL_MS,
          distanceInterval: WATCH_DISTANCE_M,
        },
        (loc: LocationObject) => {
          const next: ResolvedDeviceCoords = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          };
          if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) {
            return;
          }
          const last = lastEmittedRef.current;
          if (last && haversineMeters(last, next) < WATCH_DISTANCE_M) {
            // `expo-location` already filters by `timeInterval`; this
            // extra distance check stops a GPS jitter from re-rendering
            // React when the device hasn't actually moved.
            return;
          }
          lastEmittedRef.current = next;
          deviceRef.current = next;
          setDevice(next);
        },
        () => {
          // Subscription errored — drop the subscription so the next
          // `refresh()` can start a fresh one.
          try {
            subRef.current?.remove();
          } catch {
            /* ignore */
          }
          subRef.current = null;
        },
      );
      subRef.current = sub;
    } catch {
      /* permission denied / unsupported — fall back to non-device coords */
    }
  }, []);

  /**
   * Stop the watch subscription (if any). Always safe to call.
   */
  const stopWatch = useCallback(() => {
    if (subRef.current) {
      try {
        subRef.current.remove();
      } catch {
        /* ignore */
      }
      subRef.current = null;
    }
    lastEmittedRef.current = null;
  }, []);

  // Mount: run the first fix. On resolution, either arm the watch (if
  // we got real device coords) or just settle into the profile/default
  // fallback path.
  useInitialFix(timeoutMs, (coords) => {
    setDevice(coords);
    setLoading(false);
    if (coords) {
      lastEmittedRef.current = coords;
      // Fire-and-forget — the loading state has already settled.
      void startWatch();
    }
  });

  // `refresh()` — explicit re-resolve from the Home "Locate me" FAB.
  // Clears any cached device state, drops the watch subscription,
  // bumps a counter that re-runs `useInitialFix`, then re-arms the
  // watch on success.
  const refresh = useCallback(async () => {
    stopWatch();
    deviceRef.current = null;
    setDevice(null);
    setLoading(true);
    setRefreshTick((t) => t + 1);
  }, [stopWatch]);

  // Re-run the initial fix whenever `refresh()` bumps the tick. We
  // intentionally do NOT pass the same handler identity as the mount
  // effect — instead we subscribe to `refreshTick` so each refresh
  // gets its own race that doesn't share state with the first.
  useEffect(() => {
    if (refreshTick === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const coords = await resolveCurrentDeviceCoords({ timeoutMs });
        if (cancelled) return;
        setDevice(coords);
        if (coords) {
          lastEmittedRef.current = coords;
          void startWatch();
        }
      } catch {
        if (!cancelled) setDevice(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick, timeoutMs, startWatch]);

  // Clean up the watch on unmount.
  useEffect(() => {
    return () => stopWatch();
  }, [stopWatch]);

  // Decide which resolution wins. Device first; then saved profile;
  // then the explicit fallback.
  if (device) {
    return { coords: device, source: "device", loading: false, refresh };
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
      refresh,
    };
  }
  return { coords: fallback, source: "default", loading, refresh };
}