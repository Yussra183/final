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

    /** Standard attribute keys used by the handshake interceptor. */
    public static final String ATTR_ACTOR_ID = "tracking.actorId";
    public static final String ATTR_ACTOR_ROLE = "tracking.actorRole";

    public void register(WebSocketSession session) {
        sessions.put(session.getId(), session);
    }

    public void unregister(String sessionId) {
        sessions.remove(sessionId);
        subscriptions.values().forEach(set -> set.remove(sessionId));
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
    }

    /**
     * Remove every subscription that points at {@code sessionId}.
     * Called from {@link TrackingWebSocketHandler#afterConnectionClosed}.
     */
    public void unsubscribe(String sessionId) {
        subscriptions.values().forEach(set -> set.remove(sessionId));
    }

    /** Snapshot of every session currently subscribed to {@code orderId}. */
    public Set<String> subscribersOf(Long orderId) {
        Set<String> s = subscriptions.get(orderId);
        return s == null ? Set.of() : Set.copyOf(s);
    }
}