package com.project.gas_delivery.tracking.handler;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.tracking.dto.LocationUpdateRequest;
import com.project.gas_delivery.tracking.exception.TrackingForbiddenException;
import com.project.gas_delivery.tracking.service.DeliveryTrackingService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * Spring {@link TextWebSocketHandler} for the {@code /ws/tracking}
 * endpoint.
 *
 * <h2>Wire protocol</h2>
 *
 * <p>Client → server frames are JSON objects with a {@code type}
 * discriminator:</p>
 *
 * <pre>
 * { "type": "SUBSCRIBE",   "orderId": 42 }
 * { "type": "UNSUBSCRIBE", "orderId": 42 }
 * { "type": "LOCATION_UPDATE",
 *   "orderId": 42,
 *   "lat": -6.7629, "lng": 39.2026,
 *   "headingDeg": 145, "speedMps": 6.5, "accuracyM": 12,
 *   "status": "in_transit", "clientTsMs": 1721820000000 }
 * </pre>
 *
 * <p>Server → client frames are always
 * {@link com.project.gas_delivery.tracking.dto.LocationUpdateMessage}
 * with {@code type="LOCATION_UPDATE"}. A SUBSCRIBE is acked by
 * replaying the latest cached position (if any) immediately.</p>
 *
 * <h2>Lifecycle</h2>
 * <ul>
 *   <li>{@link #afterConnectionEstablished} — registers the session.</li>
 *   <li>{@link #handleTextMessage} — dispatches by {@code type}.</li>
 *   <li>{@link #afterConnectionClosed} — unregisters the session and
 *       drops its subscriptions.</li>
 * </ul>
 *
 * <h2>Bean wiring</h2>
 * <p>This handler deliberately depends only on the leaf
 * {@link TrackingSessionRegistry} (for id/role lookup) and the
 * {@link DeliveryTrackingService} (for subscribe / ingest / JSON
 * parsing). Outbound broadcasts go through {@link TrackingBroadcaster},
 * which {@code DeliveryTrackingService} depends on — that breaks the
 * would-be cycle between this handler and the service.</p>
 */
@Component
public class TrackingWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(TrackingWebSocketHandler.class);

    private final TrackingSessionRegistry registry;
    private final DeliveryTrackingService trackingService;
    private final ObjectMapper objectMapper;

    public TrackingWebSocketHandler(
            TrackingSessionRegistry registry,
            DeliveryTrackingService trackingService,
            ObjectMapper objectMapper
    ) {
        this.registry = registry;
        this.trackingService = trackingService;
        this.objectMapper = objectMapper;
    }

    // ---- Lifecycle ------------------------------------------------------

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) {
        registry.register(session);
        log.info("Tracking socket opened sid={} actor={}",
                session.getId(), registry.actorIdOf(session));
    }

    @Override
    public void afterConnectionClosed(@NonNull WebSocketSession session, @NonNull CloseStatus status) {
        registry.unregister(session.getId());
        trackingService.unsubscribe(session.getId());
        log.info("Tracking socket closed sid={} status={}",
                session.getId(), status);
    }

    @Override
    public void handleTransportError(@NonNull WebSocketSession session, @NonNull Throwable exception) {
        log.warn("Tracking transport error sid={} msg={}",
                session.getId(), exception.getMessage());
        try {
            session.close(CloseStatus.SERVER_ERROR);
        } catch (Exception ignored) {
            // already broken; nothing we can do
        }
    }

    // ---- Inbound dispatch -----------------------------------------------

    @Override
    protected void handleTextMessage(
            @NonNull WebSocketSession session,
            @NonNull TextMessage message
    ) {
        final JsonNode frame;
        try {
            frame = objectMapper.readTree(message.getPayload());
        } catch (Exception e) {
            sendError(session, "Malformed frame: " + e.getMessage());
            return;
        }
        String type = textOr(frame, "type", null);
        if (type == null) {
            sendError(session, "Frame is missing required field 'type'.");
            return;
        }
        try {
            switch (type) {
                case "SUBSCRIBE" -> handleSubscribe(session, frame);
                case "UNSUBSCRIBE" -> handleUnsubscribe(session, frame);
                case "LOCATION_UPDATE" -> handleLocationUpdate(session, frame);
                case "PING" -> session.sendMessage(new TextMessage("{\"type\":\"PONG\"}"));
                default -> sendError(session, "Unknown frame type: " + type);
            }
        } catch (TrackingForbiddenException e) {
            sendError(session, e.getMessage());
        } catch (Exception e) {
            log.warn("Tracking frame handler crashed sid={} type={} msg={}",
                    session.getId(), type, e.getMessage());
            sendError(session, "Internal error: " + e.getMessage());
        }
    }

    private void handleSubscribe(WebSocketSession session, JsonNode frame) {
        Long tripId = longOr(frame, "tripId");
        if (tripId != null) {
            Long actorId = registry.actorIdOf(session);
            Role actorRole = registry.roleOf(session);
            trackingService.subscribeTrip(actorId, actorRole, tripId, session.getId());
            return;
        }
        Long orderId = longOr(frame, "orderId");
        if (orderId == null) {
            sendError(session, "SUBSCRIBE requires 'orderId' or 'tripId'.");
            return;
        }
        Long actorId = registry.actorIdOf(session);
        Role actorRole = registry.roleOf(session);
        trackingService.subscribe(actorId, actorRole, orderId, session.getId());
        // Replay of the cached position is handled inside subscribe().
    }

    private void handleUnsubscribe(WebSocketSession session, JsonNode frame) {
        // Per-order unsubscribe isn't needed for the MVP: the connection
        // close path drops every subscription. Tell the client to
        // simply close the socket.
        sendError(session, "Use socket close to unsubscribe all.");
    }

    private void handleLocationUpdate(WebSocketSession session, JsonNode frame) {
        Long tripId = longOr(frame, "tripId");
        if (tripId != null) {
            Double lat = doubleOr(frame, "lat");
            Double lng = doubleOr(frame, "lng");
            if (lat == null || lng == null) {
                sendError(session, "LOCATION_UPDATE requires 'lat' and 'lng'.");
                return;
            }
            LocationUpdateRequest req = new LocationUpdateRequest(
                    lat,
                    lng,
                    doubleOr(frame, "headingDeg"),
                    doubleOr(frame, "speedMps"),
                    doubleOr(frame, "accuracyM"),
                    textOr(frame, "status", null),
                    longOr(frame, "clientTsMs")
            );
            Long actorId = registry.actorIdOf(session);
            Role actorRole = registry.roleOf(session);
            trackingService.ingestForTrip(actorId, actorRole, tripId, req);
            return;
        }
        Long orderId = longOr(frame, "orderId");
        if (orderId == null) {
            sendError(session, "LOCATION_UPDATE requires 'orderId' or 'tripId'.");
            return;
        }
        Double lat = doubleOr(frame, "lat");
        Double lng = doubleOr(frame, "lng");
        if (lat == null || lng == null) {
            sendError(session, "LOCATION_UPDATE requires 'lat' and 'lng'.");
            return;
        }
        LocationUpdateRequest req = new LocationUpdateRequest(
                lat,
                lng,
                doubleOr(frame, "headingDeg"),
                doubleOr(frame, "speedMps"),
                doubleOr(frame, "accuracyM"),
                textOr(frame, "status", null),
                longOr(frame, "clientTsMs")
        );
        Long actorId = registry.actorIdOf(session);
        Role actorRole = registry.roleOf(session);
        // Service throws TrackingForbiddenException on bad actor; on
        // success it broadcasts the accepted frame via the broadcaster.
        trackingService.ingest(actorId, actorRole, orderId, req);
    }

    // ---- Outbound helpers (error frames only — broadcasts go through
    //      TrackingBroadcaster, injected into DeliveryTrackingService) ----

    private void sendError(WebSocketSession session, String message) {
        String payload = "{\"type\":\"ERROR\",\"message\":\"" + escape(message) + "\"}";
        try {
            synchronized (session) {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(payload));
                }
            }
        } catch (Exception e) {
            log.debug("Tracking error-send failed sid={} msg={}",
                    session.getId(), e.getMessage());
        }
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    // ---- JsonNode helpers -----------------------------------------------

    private static String textOr(JsonNode node, String field, String fallback) {
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? fallback : v.asText();
    }

    private static Long longOr(JsonNode node, String field) {
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) return null;
        return v.asLong();
    }

    private static Double doubleOr(JsonNode node, String field) {
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) return null;
        return v.asDouble();
    }
}