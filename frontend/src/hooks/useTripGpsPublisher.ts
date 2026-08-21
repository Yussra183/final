/**
 * src/hooks/useTripGpsPublisher.ts
 *
 * Publisher half of the supplier Live Delivery experience.
 *
 * The supplier's device (the phone in the truck, in practice) opens its
 * own {@link TrackingClient} WebSocket and pushes every GPS sample into
 * the trip channel via `client.sendLocation({ tripId, ...sample })`.
 * Sellers subscribed to the same trip's tracking channel will receive
 * those frames and render the rider position live; the supplier's own
 * Live Delivery screen reads them back through {@link useTripTracking}
 * (same socket, same broadcaster).
 *
 * Backend authorisation (`DeliveryTrackingService.ingestForTrip`): the
 * owning supplier is an accepted publisher on the trip channel — see
 * the `isOwningSupplier` branch. Backend also drops samples for
 * non-ACTIVE trips, so the hook is a no-op until the supplier has
 * called "Confirm & Start Delivery" on the route.
 *
 * Throttling + filtering is borrowed from {@link useRiderGps}:
 *   • max one sample / 3 s wall-clock
 *   • only after ≥10 m of movement from the previous accepted sample
 * (matches the server-side `MIN_DELTA_METERS` dedup so we don't
 *  waste bandwidth when the truck is parked.)
 *
 * On socket drop the REST fallback `TrackingApi.postTripLocation` is
 * used so a transient network blip doesn't lose the latest fix.
 */
import { useCallback, useEffect, useRef } from "react";
import * as Location from "expo-location";
import type {
  LocationObject,
  LocationSubscription,
} from "expo-location";
import {
  createTrackingClient,
  TrackingClient,
} from "../services/TrackingClient";
import { TrackingApi } from "../api/endpoints";
import { haversineMeters, LatLng } from "../lib/location";

const MIN_INTERVAL_MS = 3_000;
const MIN_DISTANCE_M = 10;
const PERMISSION_TIMEOUT_MS = 10_000;

export interface TripGpsPublisherOptions {
  /** Trip id (numeric string from the backend, e.g. {@code "42"}). */
  tripId: string | null | undefined;
  /** Bearer token used to authenticate the WS handshake. */
  token: string | null | undefined;
  /**
   * Optional callback fired when the OS denies foreground location
   * permission. Default no-op.
   */
  onPermissionDenied?: (reason: string) => void;
  /**
   * Override the {@link Location.Accuracy} preset. Default
   * {@link Location.Accuracy.High}.
   */
  accuracy?: Location.Accuracy;
}

export interface TripGpsPublisherController {
  /** Begin watching the device position and publishing to the trip channel. */
  start(): Promise<void>;
  /** Stop watching + close the socket. Safe to call repeatedly. */
  stop(): void;
  /** Whether a watch subscription is currently active. */
  isRunning(): boolean;
}

/**
 * Mount on the supplier's Live Delivery screen. Pairs naturally with
 * {@link useTripTracking}: the same screen reads back the very frames
 * it publishes, so a single trip channel carries both directions of
 * the live-tracking conversation.
 */
export function useTripGpsPublisher(
  opts: TripGpsPublisherOptions,
): TripGpsPublisherController {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const subRef = useRef<LocationSubscription | null>(null);
  const clientRef = useRef<TrackingClient | null>(null);
  const lastEmittedRef = useRef<{
    at: number;
    pos: LatLng;
  } | null>(null);

  const stop = useCallback(() => {
    if (subRef.current) {
      try {
        subRef.current.remove();
      } catch {
        // ignore
      }
      subRef.current = null;
    }
    if (clientRef.current) {
      try {
        clientRef.current.disconnect();
      } catch {
        // ignore
      }
      clientRef.current = null;
    }
    lastEmittedRef.current = null;
  }, []);

  const emitSample = useCallback(
    (loc: LocationObject) => {
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

      const { tripId, token } = optsRef.current;
      if (!tripId || !token) return;
      const numericTripId = Number(tripId);
      if (!Number.isFinite(numericTripId)) return;

      const sample = {
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
      };

      const client = clientRef.current;
      const sentOverSocket =
        client?.isConnected() &&
        (client.sendLocation({ tripId: numericTripId, ...sample }), true);
      if (!sentOverSocket) {
        // REST fallback — survives transient socket failures so we
        // don't drop the sample while the socket is reconnecting.
        TrackingApi.postTripLocation(tripId, sample).catch((err: unknown) => {
          if (__DEV__) {
            console.warn(
              "[TRACKING][TRIP_REST_POST_FAILED]",
              err instanceof Error ? err.message : err,
            );
          }
        });
      }
    },
    [],
  );

  const start = useCallback(async () => {
    if (subRef.current) return; // already running
    const { tripId, token } = optsRef.current;
    if (!tripId || !token) return;
    const numericTripId = Number(tripId);
    if (!Number.isFinite(numericTripId)) return;

    const perm = await Promise.race<Location.LocationPermissionResponse>([
      Location.requestForegroundPermissionsAsync(),
      new Promise<Location.LocationPermissionResponse>((_resolve, reject) =>
        setTimeout(
          () =>
            reject(new Error("Location permission request timed out")),
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

    // 1. Open the socket + subscribe to the trip channel so the
    //    server accepts our LOCATION_UPDATE frames.
    const client = createTrackingClient(
      {
        // Supplier-side: we don't consume inbound frames here (the
        // Live Delivery screen subscribes via `useTripTracking`),
        // but we still need a stable handler so the client doesn't
        // assert on a missing callback.
        onLocation: () => {},
        onOpen: () => {
          if (Number.isFinite(numericTripId)) {
            client.subscribeTrip(numericTripId);
          }
        },
        onError: (msg) => {
          if (__DEV__) console.warn("[TRACKING][TRIP_PUB_FRAME_ERROR]", msg);
        },
        onClose: () => {
          // The TrackingClient retries on its own.
        },
      },
      { token },
    );
    client.connect();
    clientRef.current = client;

    // 2. Begin watching GPS.
    const accuracy = optsRef.current.accuracy ?? Location.Accuracy.High;
    subRef.current = await Location.watchPositionAsync(
      {
        accuracy,
        distanceInterval: MIN_DISTANCE_M,
        timeInterval: MIN_INTERVAL_MS,
      },
      emitSample,
    );
  }, [emitSample]);

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