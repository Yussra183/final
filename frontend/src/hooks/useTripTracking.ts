/**
 * src/hooks/useTripTracking.ts
 *
 * Sibling of {@link useOrderTracking} that subscribes to a supplier
 * delivery-operation **trip's** real-time tracking channel instead of
 * an order's channel. The wire shape, socket lifecycle, and reconnect
 * semantics are identical — only three lines differ:
 *
 *   1. Bootstrap REST call: `TrackingApi.latestTrip(tripId)`
 *      (vs. `TrackingApi.latest(orderId)`).
 *   2. Inbound-frame filter: `String(msg.tripId) !== String(tripId)`
 *      (vs. `msg.orderId`).
 *   3. Socket subscribe: `client.subscribeTrip(numericTripId)`
 *      (vs. `client.subscribe(numericOrderId)`).
 *
 * The bootstrap response uses `NaN` as the "no cached sample yet"
 * sentinel — different from the order endpoint's `1970-01-01` zero —
 * so the cold-cache guard is `Number.isFinite`, NOT a date check.
 *
 * Used by the supplier's "Live Delivery" screen to see the rider's
 * current position and the trip's last-known status.
 */
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/errors";
import { TrackingApi } from "../api/endpoints";
import type { LocationUpdateMessage } from "../api/endpoints";
import {
  createTrackingClient,
  TrackingClient,
} from "../services/TrackingClient";
import type {
  OrderTrackingState,
  TrackingConnectionState,
} from "./useOrderTracking";

export interface UseTripTrackingArgs {
  /** Trip id (numeric string from the backend, e.g. {@code "42"}). */
  tripId: string | null | undefined;
  /** Bearer token used to authenticate the WS handshake. */
  token: string | null | undefined;
}

/**
 * Subscribe to {@code tripId}'s tracking channel. Returns
 * {@link OrderTrackingState} that updates on every accepted frame.
 *
 * Pass {@code null}/{@code undefined} for {@code tripId} to skip
 * subscription entirely (useful while the parent screen is still
 * loading the trip). The hook will return the default empty state.
 */
export function useTripTracking({
  tripId,
  token,
}: UseTripTrackingArgs): OrderTrackingState {
  const [state, setState] = useState<OrderTrackingState>({
    riderLatLng: null,
    status: null,
    ts: null,
    raw: null,
    connection: "idle",
  });

  // Latest-callback ref so the socket can read fresh handlers without
  // forcing the effect to re-run on every render.
  const tripIdRef = useRef<string | null | undefined>(tripId);
  tripIdRef.current = tripId;

  useEffect(() => {
    if (!tripId || !token) {
      setState({
        riderLatLng: null,
        status: null,
        ts: null,
        raw: null,
        connection: "idle",
      });
      return;
    }

    let disposed = false;
    const numericTripId = Number(tripId);
    // The legacy client-side simulated trips may carry non-numeric ids;
    // guard so we don't subscribe to a bogus channel.
    if (!Number.isFinite(numericTripId)) {
      setState({
        riderLatLng: null,
        status: null,
        ts: null,
        raw: null,
        connection: "idle",
      });
      return;
    }

    // 1. Bootstrap from REST so the UI can render the rider marker
    //    immediately without waiting for the first WS frame.
    setState((prev) => ({ ...prev, connection: "connecting" }));
    TrackingApi.latestTrip(tripId)
      .then((msg) => {
        if (disposed) return;
        if (
          typeof msg?.lat === "number" &&
          typeof msg?.lng === "number" &&
          Number.isFinite(msg.lat) &&
          Number.isFinite(msg.lng)
        ) {
          setState((prev) => ({
            ...prev,
            riderLatLng: { lat: msg.lat, lng: msg.lng },
            status: msg.status ?? prev.status,
            ts: msg.ts ?? prev.ts,
            raw: msg,
          }));
        }
      })
      .catch((err: unknown) => {
        // 403 / 404 are expected on cold start (no rider yet). Don't
        // surface — the WS subscription will fill in the rider once
        // they start moving.
        if (
          err instanceof ApiError &&
          (err.status === 403 || err.status === 404)
        ) {
          return;
        }
        if (__DEV__) {
          console.warn(
            "[TRACKING][TRIP_BOOTSTRAP_FAILED]",
            err instanceof Error ? err.message : err,
          );
        }
      });

    // 2. Open the socket and subscribe to this trip.
    let client: TrackingClient | null = null;
    try {
      client = createTrackingClient(
        {
          onOpen: () => {
            if (disposed) return;
            setState((prev) => ({ ...prev, connection: "open" }));
          },
          onClose: () => {
            if (disposed) return;
            setState((prev) => ({ ...prev, connection: "reconnecting" }));
          },
          onError: (message) => {
            if (!__DEV__) return;
            console.warn("[TRACKING][TRIP_FRAME_ERROR]", message);
          },
          onLocation: (msg) => {
            if (disposed) return;
            // Filter — only accept frames for our trip. The socket
            // already restricts per-tripId, but defensive code is
            // cheap.
            if (String(msg.tripId) !== String(tripIdRef.current)) return;
            if (
              typeof msg.lat !== "number" ||
              typeof msg.lng !== "number" ||
              !Number.isFinite(msg.lat) ||
              !Number.isFinite(msg.lng)
            ) {
              return;
            }
            setState({
              riderLatLng: { lat: msg.lat, lng: msg.lng },
              status: msg.status ?? null,
              ts: msg.ts ?? null,
              raw: msg,
              connection: "open",
            });
          },
        },
        { token },
      );
      client.connect();
      client.subscribeTrip(numericTripId);
    } catch (e) {
      if (__DEV__) {
        console.warn("[TRACKING][TRIP_SOCKET_CREATE_FAILED]", e);
      }
      setState((prev) => ({ ...prev, connection: "reconnecting" }));
    }

    return () => {
      disposed = true;
      try {
        client?.disconnect();
      } catch {
        // ignore
      }
    };
  }, [tripId, token]);

  return state;
}

// Re-export the state + connection types so consumers don't have to
// import from `useOrderTracking` to type-check the return value.
export type { OrderTrackingState, TrackingConnectionState };