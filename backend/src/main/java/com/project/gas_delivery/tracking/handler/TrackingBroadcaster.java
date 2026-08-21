package com.project.gas_delivery.tracking.handler;

import com.project.gas_delivery.tracking.dto.LocationUpdateMessage;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/**
 * Leaf-level bean that owns the outbound side of the tracking pipeline.
 *
 * <p>This is split out of {@link com.project.gas_delivery.tracking.service.DeliveryTrackingService}
 * to break the bean dependency cycle:</p>
 *
 * <pre>
 *   OrderServiceImpl → DeliveryTrackingService → TrackingBroadcaster → TrackingSessionRegistry
 *                                       ↑                                  ↑
 *   TrackingWebSocketHandler → DeliveryTrackingService (for toJson/fromJson)
 * </pre>
 *
 * <p>{@link TrackingWebSocketHandler} still depends on
 * {@link com.project.gas_delivery.tracking.service.DeliveryTrackingService}
 * (it needs {@code toJson} / {@code fromJson} for frame parsing), but
 * the service now depends on this broadcaster rather than the handler
 * itself, so the cycle is gone.</p>
 */
@Component
public class TrackingBroadcaster {

    private static final Logger log = LoggerFactory.getLogger(TrackingBroadcaster.class);

    private final TrackingSessionRegistry registry;
    private final ObjectMapper objectMapper;

    public TrackingBroadcaster(
            TrackingSessionRegistry registry,
            ObjectMapper objectMapper
    ) {
        this.registry = registry;
        this.objectMapper = objectMapper;
    }

    /**
     * Send a freshly ingested frame to every subscriber of
     * {@code orderId}. Errors are swallowed — a slow client must never
     * stall the broadcast path.
     */
    public void broadcast(Long orderId, @NonNull LocationUpdateMessage msg) {
        String json;
        try {
            json = objectMapper.writeValueAsString(msg);
        } catch (Exception e) {
            log.warn("Tracking serialise failed for order {}: {}", orderId, e.getMessage());
            return;
        }
        TextMessage frame = new TextMessage(json);
        for (String sessionId : registry.subscribersOf(orderId)) {
            sendQuietly(sessionId, frame);
        }
    }

    /**
     * Send a freshly ingested trip-tracking frame to every subscriber of
     * {@code tripId}. Mirrors {@link #broadcast(Long, LocationUpdateMessage)}
     * for the additive trip channel introduced by the supplier delivery-
     * operations feature. The same broadcaster, the same WebSocket
     * sessions, the same envelope — only the channel key is different.
     */
    public void broadcastTrip(Long tripId, @NonNull LocationUpdateMessage msg) {
        String json;
        try {
            json = objectMapper.writeValueAsString(msg);
        } catch (Exception e) {
            log.warn("Tracking serialise failed for trip {}: {}", tripId, e.getMessage());
            return;
        }
        TextMessage frame = new TextMessage(json);
        for (String sessionId : registry.tripSubscribersOf(tripId)) {
            sendQuietly(sessionId, frame);
        }
    }

    /**
     * Send a single frame to one session — used by the service to
     * replay the cached position right after a SUBSCRIBE.
     */
    public void sendToSession(String sessionId, @NonNull LocationUpdateMessage msg) {
        WebSocketSession session = registry.get(sessionId);
        if (session == null || !session.isOpen()) return;
        try {
            String json = objectMapper.writeValueAsString(msg);
            synchronized (session) {
                session.sendMessage(new TextMessage(json));
            }
        } catch (Exception e) {
            log.debug("Tracking send-to-session failed sid={} msg={}",
                    sessionId, e.getMessage());
        }
    }

    private void sendQuietly(String sessionId, TextMessage frame) {
        WebSocketSession session = registry.get(sessionId);
        if (session == null || !session.isOpen()) return;
        try {
            synchronized (session) {
                session.sendMessage(frame);
            }
        } catch (Exception e) {
            log.debug("Tracking send failed sid={} msg={}", sessionId, e.getMessage());
        }
    }
}