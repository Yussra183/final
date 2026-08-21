/**
 * src/services/TrackingClient.ts
 *
 * Thin wrapper over the native `WebSocket` API for the
 * {@code /ws/tracking} channel exposed by the Spring Boot backend.
 *
 * Responsibilities:
 *   • Open one connection per order, re-using the same socket across
 *     multiple SUBSCRIBE / UNSUBSCRIBE round-trips.
 *   • Attach the same `Authorization: Bearer <token>` header used by the
 *     REST client so the handshake interceptor can authenticate.
 *   • Multiplex inbound frames by `type` and dispatch them to the
 *     caller-supplied handler.
 *   • Reconnect with exponential back-off on transient socket errors
 *     (network drop, server restart) so the rider / customer / seller
 *     screens recover automatically without a manual refresh.
 *
 * Designed to be used by {@link useOrderTracking} — the hook owns the
 * React lifecycle; this module is purely a transport primitive.
 *
 * No third-party dependency. The native `WebSocket` global is the same
 * on Expo Go (browser shim) and on a development build (engine.io poly
 * via React Native's URL polyfill), so a single code path works on
 * every platform we ship to.
 */
import { API_CONFIG, buildWsUrl } from "../api/config";
import type { LocationUpdateMessage } from "../api/endpoints";

export interface TrackingClientHandlers {
  /** Called for every well-formed LOCATION_UPDATE frame. */
  onLocation: (msg: LocationUpdateMessage) => void;
  /** Called for ERROR frames (bad subscribe id, bad actor, etc.). */
  onError?: (message: string) => void;
  /** Fired when the socket transitions to OPEN — useful for replay. */
  onOpen?: () => void;
  /** Fired when the socket drops. */
  onClose?: (code: number, reason: string) => void;
}

export interface TrackingClientOptions {
  /** Bearer token to authenticate the handshake. */
  token: string;
  /**
   * How long to wait between reconnect attempts, in ms. Doubles on each
   * failure, capped at {@link MAX_BACKOFF_MS}. Defaults to 1s.
   */
  initialBackoffMs?: number;
  /**
   * Hard cap on the reconnect back-off so a long-lived socket doesn't
   * stall on a 5-minute wait if the server stays down. Defaults to 15s.
   */
  maxBackoffMs?: number;
}

const DEFAULT_INITIAL_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 15_000;

/**
 * Stateful client. Created with {@link createTrackingClient}; callers
 * invoke {@link TrackingClient.connect} / {@link TrackingClient.subscribe} /
 * {@link TrackingClient.disconnect} from React effects.
 */
export interface TrackingClient {
  /** Open (or re-open) the underlying socket. Idempotent. */
  connect(): void;
  /**
   * Subscribe to a specific order's tracking channel. Triggers a SUBSCRIBE
   * frame after the socket is OPEN. Subsequent calls with the same
   * {@code orderId} are no-ops.
   */
  subscribe(orderId: number): void;
  /**
   * Subscribe to a supplier delivery-operation trip's tracking channel.
   * Mirrors {@link TrackingClient.subscribe} for the additive trip path
   * that the supplier live-tracking feature uses. Same socket, same
   * broadcaster, same dedupe — only the channel key is different.
   */
  subscribeTrip(tripId: number): void;
  /**
   * Drop a subscription. Sends an UNSUBSCRIBE frame if the socket is
   * OPEN. Safe to call with an unknown {@code orderId}.
   */
  unsubscribe(orderId: number): void;
  /** Close the socket and stop reconnect attempts. */
  disconnect(): void;
  /**
   * Publish a LOCATION_UPDATE frame from the rider's GPS pipeline.
   * Drops the frame silently if the socket isn't open — the REST
   * fallback in {@link TrackingApi.postLocation} is responsible for
   * back-fill in that case.
   *
   * <p>Either {@code orderId} (customer/rider order channel) or
   * {@code tripId} (supplier delivery-operations channel) must be
   * present. The server-side dispatcher treats the two as mutually
   * exclusive.</p>
   */
  sendLocation(payload: {
    orderId?: number;
    tripId?: number;
    lat: number;
    lng: number;
    headingDeg?: number;
    speedMps?: number;
    accuracyM?: number;
    status?: string;
    clientTsMs?: number;
  }): void;
  /** True while the underlying socket is in OPEN state. */
  isConnected(): boolean;
}

/**
 * Factory. The returned client must be paired with a single
 * {@link TrackingClient.disconnect} on unmount to avoid leaks.
 *
 * @param handlers  callbacks for inbound frames.
 * @param options   token + reconnect tuning.
 */
export function createTrackingClient(
  handlers: TrackingClientHandlers,
  options: TrackingClientOptions,
): TrackingClient {
  const url = buildWsUrl(API_CONFIG.BASE_URL);
  const token = options.token;
  const initialBackoffMs =
    options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;

  let socket: WebSocket | null = null;
  let manuallyClosed = false;
  let nextBackoffMs = initialBackoffMs;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const subscribed = new Set<number>();
  const subscribedBefore = new Set<number>();
  const subscribedTrips = new Set<number>();
  const subscribedTripsBefore = new Set<number>();

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function send(obj: unknown): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(obj));
      return true;
    } catch (e) {
      // Socket just dropped between the OPEN check and the send; the
      // close handler will schedule a reconnect.
      return false;
    }
  }

  function sendAllPendingSubscriptions() {
    subscribed.forEach((orderId) => {
      send({ type: "SUBSCRIBE", orderId });
    });
    subscribedTrips.forEach((tripId) => {
      send({ type: "SUBSCRIBE", tripId });
    });
  }

  function scheduleReconnect() {
    if (manuallyClosed) return;
    if (reconnectTimer) return;
    const delay = nextBackoffMs;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, delay);
    nextBackoffMs = Math.min(maxBackoffMs, Math.round(nextBackoffMs * 2));
  }

  function openSocket() {
    clearReconnectTimer();
    try {
      // The browser/RN `WebSocket` constructor does NOT let us attach
      // custom HTTP headers — so we pass the bearer token on the
      // query string. The backend's `TrackingHandshakeInterceptor`
      // reads `Authorization` first, then falls back to `?token=...`
      // for native clients.
      const sep = url.includes("?") ? "&" : "?";
      const ws = new WebSocket(`${url}${sep}token=${encodeURIComponent(token)}`);
      socket = ws;

      ws.onopen = () => {
        nextBackoffMs = initialBackoffMs;
        // Carry over any subscriptions the caller asked for while the
        // socket was down.
        subscribedBefore.forEach((id) => subscribed.add(id));
        subscribedBefore.clear();
        subscribedTripsBefore.forEach((id) => subscribedTrips.add(id));
        subscribedTripsBefore.clear();
        sendAllPendingSubscriptions();
        handlers.onOpen?.();
      };

      ws.onmessage = (ev) => {
        let frame: LocationUpdateMessage | { type: string; message?: string };
        try {
          frame = JSON.parse(String(ev.data));
        } catch {
          // Non-JSON frame — log and drop. Don't crash the socket.
          if (__DEV__) {
            console.warn(
              "[TRACKING][NON_JSON_FRAME]",
              String(ev.data).slice(0, 200),
            );
          }
          return;
        }
        switch (frame.type) {
          case "LOCATION_UPDATE":
            handlers.onLocation(frame as LocationUpdateMessage);
            return;
          case "ERROR":
            handlers.onError?.((frame as { message?: string }).message ?? "Unknown tracking error");
            return;
          case "PONG":
            // keep-alive ack; nothing to do
            return;
          default:
            if (__DEV__) {
              console.warn("[TRACKING][UNKNOWN_FRAME_TYPE]", frame);
            }
        }
      };

      ws.onerror = (ev: any) => {
        if (__DEV__) {
          console.warn("[TRACKING][SOCKET_ERROR]", ev?.message ?? ev);
        }
        // Let onclose handle reconnect.
      };

      ws.onclose = (ev) => {
        socket = null;
        handlers.onClose?.(ev.code, ev.reason);
        // Move the live subscriptions into the carry-over set so they
        // re-subscribe automatically when the new socket opens.
        subscribed.forEach((id) => subscribedBefore.add(id));
        subscribed.clear();
        subscribedTrips.forEach((id) => subscribedTripsBefore.add(id));
        subscribedTrips.clear();
        scheduleReconnect();
      };
    } catch (e) {
      if (__DEV__) {
        console.warn("[TRACKING][SOCKET_OPEN_FAILED]", e);
      }
      scheduleReconnect();
    }
  }

  return {
    connect() {
      if (socket) return;
      manuallyClosed = false;
      openSocket();
    },

    subscribe(orderId) {
      if (subscribed.has(orderId) || subscribedBefore.has(orderId)) return;
      subscribed.add(orderId);
      send({ type: "SUBSCRIBE", orderId });
    },

    subscribeTrip(tripId) {
      if (subscribedTrips.has(tripId) || subscribedTripsBefore.has(tripId)) {
        return;
      }
      subscribedTrips.add(tripId);
      send({ type: "SUBSCRIBE", tripId });
    },

    unsubscribe(orderId) {
      subscribed.delete(orderId);
      subscribedBefore.delete(orderId);
      send({ type: "UNSUBSCRIBE", orderId });
    },

    disconnect() {
      manuallyClosed = true;
      clearReconnectTimer();
      subscribed.clear();
      subscribedBefore.clear();
      subscribedTrips.clear();
      subscribedTripsBefore.clear();
      if (socket) {
        try {
          socket.close(1000, "client-disconnect");
        } catch {
          // ignore
        }
        socket = null;
      }
    },

    sendLocation(payload) {
      send({
        type: "LOCATION_UPDATE",
        ...payload,
      });
    },

    isConnected() {
      return !!socket && socket.readyState === WebSocket.OPEN;
    },
  };
}