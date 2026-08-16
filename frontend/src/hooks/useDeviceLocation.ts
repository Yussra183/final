/**
 * src/hooks/useDeviceLocation.ts
 *
 * Pure device-GPS resolver with a "fallback" position for when the
 * device has no fix yet (permission denied, no GPS lock, web / Expo
 * Go without the native module). The fallback is caller-supplied so
 * the same hook works for the customer Home, the seller Profile,
 * the seller picker modal — anywhere that wants a live "where am I"
 * coordinate without committing to a particular fallback strategy.
 *
 * Resolution order on mount:
 *
 *   1. Device GPS  — `resolveCurrentDeviceCoords()` once. Resolves
 *      to `null` on denial, timeout, or unsupported platform.
 *   2. Fallback    — caller-supplied; defaults to `ZANZIBAR_CENTRE`.
 *
 * Once the initial fix returns a real device position the hook
 * subscribes to `Location.watchPositionAsync` so the resolved
 * coordinate keeps moving with the user. The subscription is
 * throttled to one update per 3 s and 5 m of travel — matches the
 * rider-side `useRiderGps` cadence and the backend's
 * position-dedup threshold, so React doesn't re-render faster than
 * the server would have consumed the sample anyway.
 *
 * The hook never WRITES device coordinates anywhere; it is a pure
 * reader. Callers that want to persist a fix (e.g. the seller
 * picker saving the shop pin) read `coords` and forward them
 * through their own write path.
 *
 * Use the result for UI placement only — do NOT derive radius-
 * filtered queries from `source === "device"`. The fallback chain
 * is a *display* concern; backend queries should always go through
 * the canonical hooks (`useNearbySellers`, etc.).
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

/** Which resolution strategy actually supplied the coordinates. */
export type DeviceLocationSource = "device" | "fallback";

export interface UseDeviceLocationResult {
  /** The resolved coordinates — never `null`. */
  coords: { lat: number; lng: number };
  /** Which strategy won. */
  source: DeviceLocationSource;
  /**
   * True while the device-GPS race is still pending. Useful for
   * showing a "locating…" affordance over the map.
   */
  loading: boolean;
  /** Optional error string; only set when something went wrong AND we want to log it. */
  error?: string;
  /**
   * Force a fresh device fix (re-runs the permission + GPS race and,
   * if granted, restarts the watch subscription). The customer
   * Home's "Locate me" FAB (and the seller picker's recentre FAB)
   * use this so the camera recentres onto the *current* device
   * position rather than a stale fallback.
   *
   * Safe to call repeatedly; no-op while a refresh is already in
   * flight.
   */
  refresh: () => Promise<void>;
}

export interface UseDeviceLocationOptions {
  /** Override the GPS-fix timeout (ms). Defaults to the device helper's 8s default. */
  timeoutMs?: number;
  /** Override the fallback centre. Defaults to `ZANZIBAR_CENTRE`. */
  fallback?: { lat: number; lng: number };
}

/** Match `useRiderGps` cadence so the UI cadence stays consistent. */
const WATCH_INTERVAL_MS = 3_000;
const WATCH_DISTANCE_M = 5;

/**
 * Run the initial one-shot GPS race. Extracted so `refresh()` can
 * reuse the same path without duplicating the cancellation dance.
 */
function runInitialFix(
  timeoutMs: number | undefined,
  onResolved: (coords: ResolvedDeviceCoords | null) => void,
  onSettled: () => void,
) {
  let cancelled = false;
  (async () => {
    try {
      const coords = await resolveCurrentDeviceCoords({ timeoutMs });
      if (!cancelled) onResolved(coords);
    } catch {
      if (!cancelled) onResolved(null);
    } finally {
      if (!cancelled) onSettled();
    }
  })();
  return () => {
    cancelled = true;
  };
}

/**
 * Device-GPS resolver with caller-supplied fallback. See the file
 * header for the resolution semantics.
 */
export function useDeviceLocation(
  options: UseDeviceLocationOptions = {},
): UseDeviceLocationResult {
  const timeoutMs = options.timeoutMs;
  const fallback = options.fallback ?? ZANZIBAR_CENTRE;

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
      /* permission denied / unsupported — fall back to fallback coords */
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

  // Mount: run the first fix. On resolution, either arm the watch
  // (if we got real device coords) or just settle into the fallback.
  useEffect(() => {
    return runInitialFix(
      timeoutMs,
      (coords) => {
        setDevice(coords);
        if (coords) {
          lastEmittedRef.current = coords;
          // Fire-and-forget — the loading state has already settled.
          void startWatch();
        }
      },
      () => setLoading(false),
    );
    // `startWatch` is stable; relying on `timeoutMs` is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutMs]);

  // `refresh()` — explicit re-resolve from the Home "Locate me" FAB.
  // Clears any cached device state, drops the watch subscription,
  // bumps a counter that re-runs the initial fix, then re-arms the
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
    return runInitialFix(
      timeoutMs,
      (coords) => {
        setDevice(coords);
        if (coords) {
          lastEmittedRef.current = coords;
          void startWatch();
        }
      },
      () => setLoading(false),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick, timeoutMs]);

  // Clean up the watch on unmount.
  useEffect(() => {
    return () => stopWatch();
  }, [stopWatch]);

  // Decide which resolution wins. Device first; then the caller-
  // supplied fallback.
  if (device) {
    return { coords: device, source: "device", loading: false, refresh };
  }
  return { coords: fallback, source: "fallback", loading, refresh };
}