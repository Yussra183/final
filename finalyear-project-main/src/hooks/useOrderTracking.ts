/**
 * src/hooks/useOrderTracking.ts
 *
 * React hook that subscribes to a single order's real-time tracking
 * stream and exposes:
 *
 *   • the rider's current position (lat/lng + heading + speed)
 *   • the order status that was last broadcast
 *   • the timestamp of the last accepted sample (ISO string)
 *   • the socket connection state (idle / connecting / open / reconnecting)
 *
 * Used by the customer's tracking screen and the seller's rider tab.
 *
 * Design:
 *
 *   • One socket per hook instance — opens on mount, closes on unmount.
 *     For an MVP this is fine; if multiple orders need to be tracked
 *     simultaneously we'd lift the socket into a context provider, but
 *     the current screens only ever watch one order at a time.
 *
 *   • On mount the hook first calls {@link TrackingApi.latest} so the
 *     map can render the rider's last known position immediately
 *     (before the first WS frame lands).
 *
 *   • The socket auto-reconnects with exponential back-off (handled by
 *     {@link createTrackingClient}); the `connection` state surfaces
 *     the current status so the UI can show a "Reconnecting…" pill.
 *
 *   • The hook never throws — REST failures degrade to "no cache
 *     yet", socket failures degrade to "reconnecting". The customer /
 *     seller UI keeps rendering with whatever data is available.
 */
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/errors";
import { TrackingApi } from "../api/endpoints";
import type { LocationUpdateMessage } from "../api/endpoints";
import {
  createTrackingClient,
  TrackingClient,
} from "../services/TrackingClient";

export type TrackingConnectionState =
  /** Hook is mounted but socket has not been opened yet. */
  | "idle"
  /** TCP/handshake in progress. */
  | "connecting"
  /** Socket is OPEN; frames will flow. */
  | "open"
  /** Socket dropped; client is backing off before retry. */
  | "reconnecting";

export interface OrderTrackingState {
  /** Rider's current lat/lng. `null` until the first frame lands. */
  riderLatLng: { lat: number; lng: number } | null;
  /** Order status at sample time (e.g. {@code "in_transit"}). */
  status: string | null;
  /** ISO-8601 timestamp of the last accepted sample. */
  ts: string | null;
  /** Raw {@link LocationUpdateMessage} — for advanced consumers. */
  raw: LocationUpdateMessage | null;
  /** Socket status, for UI affordances. */
  connection: TrackingConnectionState;
}

export interface UseOrderTrackingArgs {
  /** Order id (numeric string from the backend, e.g. {@code "42"}). */
  orderId: string | null | undefined;
  /** Bearer token used to authenticate the WS handshake. */
  token: string | null | undefined;
}

/**
 * Subscribe to {@code orderId}'s tracking channel. Returns
 * {@link OrderTrackingState} that updates on every accepted frame.
 *
 * Pass {@code null}/{@code undefined} for {@code orderId} to skip
 * subscription entirely (useful while the parent screen is still
 * loading the order). The hook will return the default empty state.
 */
export function useOrderTracking({
  orderId,
  token,
}: UseOrderTrackingArgs): OrderTrackingState {
  const [state, setState] = useState<OrderTrackingState>({
    riderLatLng: null,
    status: null,
    ts: null,
    raw: null,
    connection: "idle",
  });

  // Latest-callback ref so the socket can read fresh handlers without
  // forcing the effect to re-run on every render.
  const orderIdRef = useRef<string | null | undefined>(orderId);
  orderIdRef.current = orderId;

  useEffect(() => {
    if (!orderId || !token) {
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

    // 1. Bootstrap from REST so the UI can render the rider marker
    //    immediately without waiting for the first WS frame.
    setState((prev) => ({ ...prev, connection: "connecting" }));
    TrackingApi.latest(orderId)
      .then((msg) => {
        if (disposed) return;
        if (
          typeof msg?.lat === "number" &&
          typeof msg?.lng === "number" &&
          Number.isFinite(msg.lat) &&
          Number.isFinite(msg.lng) &&
          !(msg.lat === 0 && msg.lng === 0 && msg.ts === "1970-01-01T00:00:00Z")
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
            "[TRACKING][BOOTSTRAP_FAILED]",
            err instanceof Error ? err.message : err,
          );
        }
      });

    // 2. Open the socket and subscribe to this order.
    const numericOrderId = Number(orderId);
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
            console.warn("[TRACKING][FRAME_ERROR]", message);
          },
          onLocation: (msg) => {
            if (disposed) return;
            // Filter — only accept frames for our order. The socket
            // already restricts per-orderId, but defensive code is
            // cheap.
            if (String(msg.orderId) !== String(orderIdRef.current)) return;
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
      client.subscribe(numericOrderId);
    } catch (e) {
      if (__DEV__) {
        console.warn("[TRACKING][SOCKET_CREATE_FAILED]", e);
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
  }, [orderId, token]);

  return state;
}