package com.project.gas_delivery.tracking.handler;

import com.project.gas_delivery.auth.enums.Role;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Thread-safe registry of live WebSocket sessions for the tracking
 * pipeline.
 *
 * <p>Two indices are kept:
 *
 * <ul>
 *   <li>{@code sessions} — {@code sessionId → WebSocketSession}. Lets
 *       the broadcast path iterate without reaching into Spring's
 *       internal concurrent map on every frame.</li>
 *   <li>{@code subscriptions} — {@code orderId → set of sessionIds}.
 *       Lets {@link #broadcast(Long, Object)} reach only the listeners
 *       that actually care about a specific order instead of fanning
 *       out to every connected client.</li>
 * </ul>
 *
 * <p>The actor's identity (id + role) is stashed on the session
 * attributes map during the handshake, so {@link TrackingWebSocketHandler}
 * never has to re-decode the bearer token when a frame arrives.</p>
 *
 * <p>Membership mutations go through {@link Map#compute} / atomic
 * helpers so a slow client closing a socket does not race with a
 * concurrent broadcast — at worst the broadcast hits a stale session
 * and the {@code sendMessage} call returns {@code false} which the
 * caller ignores.</p>
 */
@Component
public class TrackingSessionRegistry {

    /** Session-id → live WebSocketSession. */
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    /** orderId → set of sessionIds subscribed to that order's updates. */
    private final Map<Long, Set<String>> subscriptions = new ConcurrentHashMap<>();

    /**
     * Generic channel key → set of sessionIds. The order path still uses
     * the {@code Long}-keyed {@link #subscriptions} map above for
     * backwards compatibility; trip-scoped subscriptions land here under
     * the {@link #tripChannel(Long)} key so an order {@code id} and a
     * trip {@code id} never share a channel even if they happen to be
     * the same number.
     */
    private final Map<String, Set<String>> channelSubscriptions = new ConcurrentHashMap<>();

    /** Standard attribute keys used by the handshake interceptor. */
    public static final String ATTR_ACTOR_ID = "tracking.actorId";
    public static final String ATTR_ACTOR_ROLE = "tracking.actorRole";

    /** Canonical namespacing — keeps the {@code Long}-keyed map safe. */
    public static String orderChannel(Long orderId) {
        return "order:" + orderId;
    }

    /** Canonical namespacing — keeps trip ids separate from order ids. */
    public static String tripChannel(Long tripId) {
        return "trip:" + tripId;
    }

    public void register(WebSocketSession session) {
        sessions.put(session.getId(), session);
    }

    public void unregister(String sessionId) {
        sessions.remove(sessionId);
        subscriptions.values().forEach(set -> set.remove(sessionId));
        channelSubscriptions.values().forEach(set -> set.remove(sessionId));
    }

    public WebSocketSession get(String sessionId) {
        return sessions.get(sessionId);
    }

    public Long actorIdOf(WebSocketSession session) {
        Object v = session.getAttributes().get(ATTR_ACTOR_ID);
        return v instanceof Long ? (Long) v : null;
    }

    public Role roleOf(WebSocketSession session) {
        Object v = session.getAttributes().get(ATTR_ACTOR_ROLE);
        return v instanceof Role ? (Role) v : null;
    }

    /**
     * Subscribe a session to {@code orderId}. Idempotent — re-subscribing
     * the same session is a no-op.
     */
    public void subscribe(Long orderId, String sessionId) {
        subscriptions
                .computeIfAbsent(orderId, k -> ConcurrentHashMap.newKeySet())
                .add(sessionId);
        channelSubscriptions
                .computeIfAbsent(orderChannel(orderId), k -> ConcurrentHashMap.newKeySet())
                .add(sessionId);
    }

    /**
     * Subscribe a session to a trip's tracking channel. Same idempotency
     * contract as {@link #subscribe(Long, String)}.
     */
    public void subscribeTrip(Long tripId, String sessionId) {
        channelSubscriptions
                .computeIfAbsent(tripChannel(tripId), k -> ConcurrentHashMap.newKeySet())
                .add(sessionId);
    }

    /**
     * Remove every subscription that points at {@code sessionId}.
     * Called from {@link TrackingWebSocketHandler#afterConnectionClosed}.
     */
    public void unsubscribe(String sessionId) {
        subscriptions.values().forEach(set -> set.remove(sessionId));
        channelSubscriptions.values().forEach(set -> set.remove(sessionId));
    }

    /** Snapshot of every session currently subscribed to {@code orderId}. */
    public Set<String> subscribersOf(Long orderId) {
        Set<String> s = subscriptions.get(orderId);
        return s == null ? Set.of() : Set.copyOf(s);
    }

    /** Snapshot of every session currently subscribed to {@code tripId}. */
    public Set<String> tripSubscribersOf(Long tripId) {
        Set<String> s = channelSubscriptions.get(tripChannel(tripId));
        return s == null ? Set.of() : Set.copyOf(s);
    }
}