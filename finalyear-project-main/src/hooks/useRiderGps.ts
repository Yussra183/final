/**
 * src/hooks/useRiderGps.ts
 *
 * Wraps `expo-location`'s {@link Location.watchPositionAsync} (SDK 54)
 * for the rider's GPS pipeline. Emits throttled, distance-filtered
 * samples through a callback so the rider app can publish them to the
 * backend over the WebSocket (or REST fallback).
 *
 * Lifecycle:
 *
 *   • `start()` — requests foreground permission if needed and begins
 *     watching the device position. Subsequent calls while already
 *     running are a no-op.
 *   • `stop()` — removes the watch subscription. Safe to call from
 *     unmount cleanup.
 *   • While running, the hook invokes the consumer's `onSample`
 *     callback at most once per `{MIN_INTERVAL_MS}` AND only after the
 *     rider has moved at least `{MIN_DISTANCE_M}` from the previous
 *     accepted sample — matches the backend's
 *     {@code DeliveryTrackingService.MIN_DELTA_METERS}.
 *
 * The hook is intentionally decoupled from the WebSocket layer: it just
 * emits samples. The rider screen wires {@link useRiderGps} into the
 * {@link createTrackingClient} instance via `onSample`.
 *
 * If permission is denied, the hook fires `onPermissionDenied` and does
 * not retry — the rider screen surfaces a banner asking them to enable
 * location services in Settings.
 */
import { useCallback, useEffect, useRef } from "react";
import * as Location from "expo-location";
import type {
  LocationObject,
  LocationSubscription,
} from "expo-location";
import { haversineMeters, LatLng } from "../lib/location";

/** Minimum wall-clock interval between emitted samples. */
const MIN_INTERVAL_MS = 3_000;
/** Minimum distance from the previous sample to fire a new one. */
const MIN_DISTANCE_M = 10;
/** Permission grace period before we treat a denial as terminal. */
const PERMISSION_TIMEOUT_MS = 10_000;

export interface RiderGpsOptions {
  /**
   * Called for every accepted sample. Runs on the JS thread — keep it
   * fast (a single `client.sendLocation(...)` is the intended use).
   */
  onSample: (sample: {
    lat: number;
    lng: number;
    headingDeg?: number;
    speedMps?: number;
    accuracyM?: number;
    status?: string;
    clientTsMs: number;
  }) => void;
  /**
   * Optional callback fired when the OS denies foreground location
   * permission. Default no-op.
   */
  onPermissionDenied?: (reason: string) => void;
  /**
   * Override the {@link Location.Accuracy} preset. Default
   * {@link Location.Accuracy.High} — accurate to ~10 m, which matches
   * the server-side {@code MIN_DELTA_METERS} filter and the rider-app's
   * 3–5 s cadence.
   */
  accuracy?: Location.Accuracy;
}

export interface RiderGpsController {
  /** Begin watching the device position. Idempotent. */
  start(): Promise<void>;
  /** Stop watching. Safe to call repeatedly. */
  stop(): void;
  /** Whether a watch subscription is currently active. */
  isRunning(): boolean;
}

/**
 * Imperative controller returned from {@link useRiderGps}. Exposed as a
 * stable object so React effects can call `start()` on mount and
 * `stop()` on unmount without re-creating the closure every render.
 */
export function useRiderGps(opts: RiderGpsOptions): RiderGpsController {
  const subRef = useRef<LocationSubscription | null>(null);
  const lastEmittedRef = useRef<{
    at: number;
    pos: LatLng;
  } | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const stop = useCallback(() => {
    if (subRef.current) {
      try {
        subRef.current.remove();
      } catch {
        // ignore
      }
      subRef.current = null;
    }
    lastEmittedRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (subRef.current) return; // already running
    const perm = await Promise.race<Location.LocationPermissionResponse>([
      Location.requestForegroundPermissionsAsync(),
      new Promise<Location.LocationPermissionResponse>((_resolve, reject) =>
        setTimeout(
          () =>
            reject(
              new Error("Location permission request timed out"),
            ),
          PERMISSION_TIMEOUT_MS,
        ),
      ),
    ]);
    if (perm.status !== "granted") {
      optsRef.current.onPermissionDenied?.(
        perm.status === "denied"
          ? "Location permission denied."
          : "Location permission not granted.",
      );
      return;
    }

    const accuracy = optsRef.current.accuracy ?? Location.Accuracy.High;
    subRef.current = await Location.watchPositionAsync(
      {
        accuracy,
        // Backend dedupes by 10 m anyway, but filtering here saves
        // wakeups + WS frames when the rider is stationary.
        distanceInterval: MIN_DISTANCE_M,
        timeInterval: MIN_INTERVAL_MS,
      },
      (loc: LocationObject) => emitSample(loc),
      (reason: string) => {
        optsRef.current.onPermissionDenied?.(reason);
        stop();
      },
    );
  }, [stop]);

  const emitSample = (loc: LocationObject) => {
    const now = Date.now();
    const point: LatLng = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
    };
    const last = lastEmittedRef.current;
    if (last) {
      const dt = now - last.at;
      if (dt < MIN_INTERVAL_MS) return; // too soon
      const d = haversineMeters(last.pos, point);
      if (d < MIN_DISTANCE_M) return; // hasn't moved
    }
    lastEmittedRef.current = { at: now, pos: point };
    optsRef.current.onSample({
      lat: point.lat,
      lng: point.lng,
      headingDeg:
        typeof loc.coords.heading === "number" && loc.coords.heading >= 0
          ? loc.coords.heading
          : undefined,
      speedMps:
        typeof loc.coords.speed === "number" && loc.coords.speed >= 0
          ? loc.coords.speed
          : undefined,
      accuracyM:
        typeof loc.coords.accuracy === "number" && loc.coords.accuracy >= 0
          ? loc.coords.accuracy
          : undefined,
      clientTsMs: loc.timestamp ?? now,
    });
  };

  // Auto-stop on unmount.
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    start,
    stop,
    isRunning: () => !!subRef.current,
  };
}