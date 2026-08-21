package com.project.gas_delivery.tracking.service;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.order.entity.OrderEntity;
import com.project.gas_delivery.order.enums.OrderStatus;
import com.project.gas_delivery.order.repository.OrderRepository;
import com.project.gas_delivery.supplier.entity.DeliveryTripEntity;
import com.project.gas_delivery.supplier.enums.DeliveryTripStatus;
import com.project.gas_delivery.supplier.repository.DeliveryTripRepository;
import com.project.gas_delivery.supplier.repository.DeliveryTripStopRepository;
import com.project.gas_delivery.tracking.dto.LocationUpdateMessage;
import com.project.gas_delivery.tracking.dto.LocationUpdateRequest;
import com.project.gas_delivery.tracking.exception.TrackingForbiddenException;
import com.project.gas_delivery.tracking.exception.TrackingOrderNotFoundException;
import com.project.gas_delivery.tracking.handler.TrackingBroadcaster;
import com.project.gas_delivery.tracking.handler.TrackingSessionRegistry;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory delivery tracking service.
 *
 * <h2>Responsibilities</h2>
 * <ul>
 *   <li><strong>Authoritative cache</strong> — keeps the
 *       {@link RiderLocation latest-known position} per {@code orderId}
 *       in a {@link ConcurrentHashMap} so customer/seller clients can
 *       bootstrap the map on first paint without waiting for the next
 *       GPS sample. Keyed by {@code orderId} because a rider can only
 *       be on one active delivery at a time in this MVP.</li>
 *   <li><strong>Deduplication</strong> — drops samples that haven't
 *       moved more than {@link #MIN_DELTA_METERS} meters from the
 *       previous accepted sample. Prevents stale-cached phones from
 *       flooding the broadcast with identical coordinates.</li>
 *   <li><strong>Authorisation</strong> — every {@link #ingest} call
 *       verifies the actor is the assigned rider of the order; every
 *       {@link #authorizeViewer} call verifies the actor is the
 *       order's customer or seller (or admin/supplier). Other callers
 *       receive 403 from the controller layer.</li>
 *   <li><strong>Broadcast</strong> — pushes the new position to every
 *       WebSocket session that has subscribed to that {@code orderId}
 *       via {@link TrackingBroadcaster#broadcast}.</li>
 *   <li><strong>Termination</strong> — {@link #clearOnDelivery} drops
 *       the cached position when the rider marks the order as
 *       {@code DELIVERED} so no further updates reach subscribers and
 *       subsequent rider GPS samples for the same order id (rare but
 *       possible after a quick re-assignment) are ignored.</li>
 * </ul>
 *
 * <h2>Failure model</h2>
 * <p>If a broadcast fails (e.g. a socket just dropped mid-write) the
 * service swallows the IO error — we never want the rider's GPS
 * pipeline to wedge because a customer momentarily lost Wi-Fi. The
 * cached position stays accurate; the next sample will refresh it.</p>
 *
 * <h2>Thread-safety</h2>
 * <p>All state is held in a {@link ConcurrentHashMap}. Mutating
 * operations on a single {@code orderId} are serialised through
 * {@link Map#compute} so the dedupe-and-broadcast path is atomic
 * against concurrent updates from the same rider (parallel web
 * sockets) or different riders on the same order (which the
 * authorisation check rejects anyway).</p>
 *
 * <h2>Bean wiring</h2>
 * <p>The service deliberately depends on the leaf-level
 * {@link TrackingBroadcaster} + {@link TrackingSessionRegistry} beans
 * (not on {@link com.project.gas_delivery.tracking.handler.TrackingWebSocketHandler}),
 * which removes the would-be cycle:
 *
 * <pre>
 *   OrderServiceImpl → DeliveryTrackingService → TrackingBroadcaster → TrackingSessionRegistry
 *                                       ↑
 *   TrackingWebSocketHandler → DeliveryTrackingService (toJson / fromJson)
 * </pre>
 * </p>
 */
@Service
public class DeliveryTrackingService {

    private static final Logger log = LoggerFactory.getLogger(DeliveryTrackingService.class);

    /**
     * Minimum movement in meters before a new sample is accepted.
     *
     * <p>10 m is roughly the GPS noise floor on a stationary phone —
     * anything tighter and we'd duplicate-broadcast every "drift" sample
     * the platform emits when the rider is waiting at a red light. 10 m
     * matches what Uber / Lyft / DoorDash filter to.</p>
     */
    static final double MIN_DELTA_METERS = 10.0;

    /**
     * Maximum staleness (since last accepted sample) before we
     * automatically accept a new sample even if it has not moved.
     *
     * <p>Catches the case where the rider is stationary for a long time
     * (e.g. queueing at the depot) but we still want a heartbeat on the
     * map so customers know the connection is alive. 15s is the
     * rider-app's normal emit cadence so a fresh sample every 15s lands
     * without fail.</p>
     */
    static final long HEARTBEAT_MS = 15_000L;

    /** Cached last-known position per active order. */
    private final Map<Long, RiderLocation> latestByOrder = new ConcurrentHashMap<>();

    private final OrderRepository orderRepository;
    private final DeliveryTripRepository tripRepository;
    private final DeliveryTripStopRepository tripStopRepository;
    private final TrackingBroadcaster broadcaster;
    private final TrackingSessionRegistry sessionRegistry;
    private final ObjectMapper objectMapper;

    public DeliveryTrackingService(
            OrderRepository orderRepository,
            DeliveryTripRepository tripRepository,
            DeliveryTripStopRepository tripStopRepository,
            TrackingBroadcaster broadcaster,
            TrackingSessionRegistry sessionRegistry,
            ObjectMapper objectMapper
    ) {
        this.orderRepository = orderRepository;
        this.tripRepository = tripRepository;
        this.tripStopRepository = tripStopRepository;
        this.broadcaster = broadcaster;
        this.sessionRegistry = sessionRegistry;
        this.objectMapper = objectMapper;
    }

    // ---- Ingest (rider → server) ----------------------------------------

    /**
     * Validate + accept a location sample from {@code actorId}.
     *
     * @return the {@link LocationUpdateMessage} that was broadcast, or
     *         {@code null} if the sample was rejected (duplicate, bad
     *         actor, or terminal order). Callers should still return
     *         200 OK — the rejection is a perf optimisation, not an
     *         error.
     */
    public LocationUpdateMessage ingest(
            Long actorId,
            Role actorRole,
            Long orderId,
            LocationUpdateRequest req
    ) {
        if (actorRole != Role.RIDER) {
            throw new TrackingForbiddenException(
                    "Only the assigned rider can send location updates.");
        }
        OrderEntity order = orderRepository.findById(orderId)
                .orElseThrow(() -> new TrackingOrderNotFoundException(
                        "Order " + orderId + " not found."));
        if (order.getRiderId() == null || !order.getRiderId().equals(actorId)) {
            throw new TrackingForbiddenException(
                    "Only the assigned rider can send location updates.");
        }
        if (isTerminal(order.getStatus())) {
            // Reject silently — the rider app will already have stopped
            // its GPS stream on DELIVERED, this just guards against
            // stragglers.
            log.debug("Dropping location for terminal order {}", orderId);
            return null;
        }

        // Atomic dedupe-and-store. We serialise per-orderId so two
        // concurrent samples from the same rider cannot both pass the
        // movement check.
        LocationUpdateMessage accepted = latestByOrder.compute(orderId, (id, prev) -> {
            LocationUpdateMessage candidate = LocationUpdateMessage.location(
                    orderId,
                    actorId,
                    req.lat(),
                    req.lng(),
                    req.headingDeg(),
                    req.speedMps(),
                    req.accuracyM(),
                    req.status() == null
                            ? order.getStatus().toJson()
                            : req.status(),
                    req.clientTsMs() == null
                            ? Instant.now()
                            : Instant.ofEpochMilli(req.clientTsMs())
            );
            if (prev == null) {
                return new RiderLocation(candidate, Instant.now());
            }
            if (shouldAccept(prev.message(), candidate)) {
                return new RiderLocation(candidate, Instant.now());
            }
            // Not accepted: keep the old payload but refresh heartbeat
            // so the broadcast thread knows the rider is still alive.
            return new RiderLocation(prev.message(), Instant.now());
        }).message();

        // Broadcast unconditionally — if `accepted` matches the cached
        // payload we still want subscribers to receive a heartbeat
        // (status changes, fresh timestamp) without requiring movement.
        broadcaster.broadcast(orderId, accepted);
        return accepted;
    }

    /**
     * Decide whether a candidate sample should replace the cached one.
     * Uses the {@link #MIN_DELTA_METERS} movement threshold OR the
     * {@link #HEARTBEAT_MS} staleness window, whichever fires first.
     */
    private boolean shouldAccept(LocationUpdateMessage prev, LocationUpdateMessage next) {
        double meters = haversineMeters(
                prev.lat(), prev.lng(),
                next.lat(), next.lng());
        if (meters >= MIN_DELTA_METERS) {
            return true;
        }
        long deltaMs = next.ts().toEpochMilli() - prev.ts().toEpochMilli();
        return deltaMs >= HEARTBEAT_MS;
    }

    // ---- Read (customer/seller → server) --------------------------------

    /**
     * Latest cached position for {@code orderId}, or {@code null} if the
     * rider has not sent anything yet. Used by the REST bootstrap
     * endpoint so freshly mounted customer/seller screens don't have to
     * wait for the first sample to draw the rider marker.
     */
    public LocationUpdateMessage latest(Long orderId) {
        RiderLocation rl = latestByOrder.get(orderId);
        return rl == null ? null : rl.message();
    }

    /**
     * Authorise a customer / seller / admin to subscribe to this order's
     * tracking channel. Throws {@link TrackingForbiddenException} (→ 403)
     * if the actor is not the assigned customer or seller.
     */
    public void authorizeViewer(Long actorId, Role actorRole, Long orderId) {
        if (actorRole == null || actorId == null) {
            throw new TrackingForbiddenException(
                    "Authentication required to view tracking.");
        }
        // Admin / supplier can always observe (read-only dashboards).
        if (actorRole == Role.ADMIN || actorRole == Role.SUPPLIER) {
            return;
        }
        OrderEntity order = orderRepository.findById(orderId)
                .orElseThrow(() -> new TrackingOrderNotFoundException(
                        "Order " + orderId + " not found."));
        boolean isCustomer = actorRole == Role.CUSTOMER
                && Objects.equals(order.getCustomerId(), actorId);
        boolean isSeller = actorRole == Role.SELLER
                && Objects.equals(order.getSellerId(), actorId);
        if (!isCustomer && !isSeller) {
            throw new TrackingForbiddenException(
                    "You are not allowed to view this delivery.");
        }
    }

    // ---- WebSocket fan-out ----------------------------------------------

    /**
     * Subscribe a session to an order's tracking channel. Called by the
     * WebSocket handler after the SUBSCRIBE frame arrives. Authorisation
     * is enforced by {@link #authorizeViewer}; the handshake interceptor
     * has already verified the bearer token, so by the time we get here
     * we know who the actor is.
     */
    public void subscribe(Long actorId, Role actorRole, Long orderId, String sessionId) {
        authorizeViewer(actorId, actorRole, orderId);
        sessionRegistry.subscribe(orderId, sessionId);

        // Replay the cached position so the new subscriber doesn't have
        // to wait for the next sample.
        LocationUpdateMessage cached = latest(orderId);
        if (cached != null) {
            broadcaster.sendToSession(sessionId, cached);
        }
    }

    /** Unsubscribe on socket close — keeps the session map clean. */
    public void unsubscribe(String sessionId) {
        sessionRegistry.unsubscribe(sessionId);
    }

    /** Drop the cached position when an order is delivered/cancelled. */
    public void clearOnDelivery(Long orderId) {
        latestByOrder.remove(orderId);
    }

    // ---- Trip channel (additive — supplier delivery operations) --------
    //
    // Mirrors the order-keyed pipeline above. We deliberately keep the
    // two paths in the same service so the shared dedupe thresholds
    // (MIN_DELTA_METERS / HEARTBEAT_MS) and broadcaster/registry wiring
    // stay in one place. Order ids and trip ids are namespaced in
    // TrackingSessionRegistry so the two channels cannot collide.

    /**
     * Cached last-known position per active trip. Trip ids and order
     * ids share the same numeric space, so this map is kept entirely
     * separate from {@link #latestByOrder} to avoid one delivery's GPS
     * surfacing on the other.
     */
    private final Map<Long, RiderLocation> latestByTrip = new ConcurrentHashMap<>();

    /**
     * Latest cached position for {@code tripId}, or {@code null} if the
     * publisher has not sent anything yet. Mirrors {@link #latest(Long)}
     * for the additive trip channel.
     */
    public LocationUpdateMessage latestTrip(Long tripId) {
        RiderLocation rl = latestByTrip.get(tripId);
        return rl == null ? null : rl.message();
    }

    /**
     * Drop the cached trip position when the trip is completed or
     * cancelled, mirroring {@link #clearOnDelivery(Long)} for the
     * additive trip channel.
     */
    public void clearOnTrip(Long tripId) {
        latestByTrip.remove(tripId);
    }

    /**
     * Ingest a location sample for a supplier delivery-operation trip.
     * The publisher is rejected unless they are the trip's assigned
     * rider OR the owning supplier (suppliers may drive the vehicle
     * themselves). Rejected unless the trip is in the ACTIVE state —
     * this is the gate that hides the position from sellers before
     * Start Delivery executes.
     *
     * @return the {@link LocationUpdateMessage} that was broadcast, or
     *         {@code null} if the sample was rejected.
     */
    public LocationUpdateMessage ingestForTrip(
            Long actorId,
            Role actorRole,
            Long tripId,
            LocationUpdateRequest req
    ) {
        if (actorId == null || actorRole == null) {
            throw new TrackingForbiddenException(
                    "Authentication required to publish trip location.");
        }
        DeliveryTripEntity trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new TrackingOrderNotFoundException(
                        "Trip " + tripId + " not found."));
        if (trip.getStatus() != DeliveryTripStatus.ACTIVE) {
            // The "tracking gate": any GPS sample before the trip is
            // ACTIVE is silently dropped so the cache never holds a
            // position sellers could later observe.
            log.debug("Dropping location for non-active trip {}", tripId);
            return null;
        }
        boolean isAssignedRider = actorRole == Role.RIDER
                && trip.getRiderId() != null
                && trip.getRiderId().equals(actorId);
        boolean isOwningSupplier = actorRole == Role.SUPPLIER
                && trip.getSupplierId() != null
                && trip.getSupplierId().equals(actorId);
        if (!isAssignedRider && !isOwningSupplier) {
            throw new TrackingForbiddenException(
                    "Only the trip's assigned rider or owning supplier can publish location.");
        }

        LocationUpdateMessage accepted = latestByTrip.compute(tripId, (id, prev) -> {
            LocationUpdateMessage candidate = LocationUpdateMessage.tripLocation(
                    tripId,
                    isAssignedRider ? actorId : trip.getRiderId(),
                    req.lat(),
                    req.lng(),
                    req.headingDeg(),
                    req.speedMps(),
                    req.accuracyM(),
                    req.status() == null ? "active" : req.status(),
                    req.clientTsMs() == null
                            ? Instant.now()
                            : Instant.ofEpochMilli(req.clientTsMs())
            );
            if (prev == null) {
                return new RiderLocation(candidate, Instant.now());
            }
            if (shouldAccept(prev.message(), candidate)) {
                return new RiderLocation(candidate, Instant.now());
            }
            return new RiderLocation(prev.message(), Instant.now());
        }).message();

        broadcaster.broadcastTrip(tripId, accepted);
        return accepted;
    }

    /**
     * Authorise a viewer to subscribe to a trip's tracking channel.
     * Mirrors {@link #authorizeViewer} but for the additive trip path:
     *
     * <ul>
     *   <li>{@code ADMIN} — always.</li>
     *   <li>{@code SUPPLIER} — only if they own the trip.</li>
     *   <li>{@code SELLER} — only if the seller is a stop on the trip
     *       AND the trip is {@code ACTIVE}. Before ACTIVE, sellers
     *       receive 403 (no location). Non-route sellers always 403.</li>
     * </ul>
     */
    public void authorizeTripViewer(Long actorId, Role actorRole, Long tripId) {
        if (actorRole == null || actorId == null) {
            throw new TrackingForbiddenException(
                    "Authentication required to view trip tracking.");
        }
        if (actorRole == Role.ADMIN) {
            return;
        }
        DeliveryTripEntity trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new TrackingOrderNotFoundException(
                        "Trip " + tripId + " not found."));
        if (actorRole == Role.SUPPLIER
                && trip.getSupplierId() != null
                && trip.getSupplierId().equals(actorId)) {
            return;
        }
        if (actorRole == Role.SELLER) {
            if (trip.getStatus() != DeliveryTripStatus.ACTIVE) {
                throw new TrackingForbiddenException(
                        "Tracking is unavailable before the delivery starts.");
            }
            boolean isStop = tripStopRepository.existsByTripIdAndSellerId(tripId, actorId);
            if (!isStop) {
                throw new TrackingForbiddenException(
                        "You are not on this delivery.");
            }
            return;
        }
        throw new TrackingForbiddenException(
                "You are not allowed to view this delivery.");
    }

    /**
     * Subscribe a session to a trip's tracking channel. Mirrors
     * {@link #subscribe} for the additive trip path.
     */
    public void subscribeTrip(Long actorId, Role actorRole, Long tripId, String sessionId) {
        authorizeTripViewer(actorId, actorRole, tripId);
        sessionRegistry.subscribeTrip(tripId, sessionId);
        LocationUpdateMessage cached = latestTrip(tripId);
        if (cached != null) {
            broadcaster.sendToSession(sessionId, cached);
        }
    }

    // ---- Wire helpers ----------------------------------------------------

    /**
     * Serialize a message to JSON for a WebSocket frame. Used by the
     * handler so the wire format is defined in one place.
     */
    public String toJson(LocationUpdateMessage msg) {
        try {
            return objectMapper.writeValueAsString(msg);
        } catch (RuntimeException e) {
            // Jackson 3 throws unchecked JsonProcessingException —
            // wrap so callers don't need a checked-exception catch.
            throw new IllegalStateException("Cannot serialize tracking message", e);
        }
    }

    /** Parse a frame from the wire into the canonical envelope. */
    public LocationUpdateMessage fromJson(String json) {
        try {
            return objectMapper.readValue(json, LocationUpdateMessage.class);
        } catch (Exception e) {
            throw new IllegalArgumentException("Malformed tracking frame: " + e.getMessage());
        }
    }

    // ---- Tiny value object ----------------------------------------------

    /**
     * Internal record that pairs the broadcast message with the
     * monotonic instant it was last refreshed. The heartbeat component
     * lets {@link #shouldAccept} decide if a stationary sample should
     * still pass through.
     */
    private record RiderLocation(LocationUpdateMessage message, Instant lastRefreshed) {}

    // ---- Haversine (duplicated here so this module has zero deps on the
    //      order package's DTOs — keeps the package self-contained) ----

    private static boolean isTerminal(OrderStatus s) {
        return s == OrderStatus.DELIVERED
                || s == OrderStatus.CANCELLED
                || s == OrderStatus.REJECTED;
    }

    private static double haversineMeters(double lat1, double lng1,
                                          double lat2, double lng2) {
        final double R = 6371000.0; // Earth radius in meters
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}