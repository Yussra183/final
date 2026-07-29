package com.project.gas_delivery.tracking.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.tracking.dto.LocationUpdateMessage;
import com.project.gas_delivery.tracking.dto.LocationUpdateRequest;
import com.project.gas_delivery.tracking.service.DeliveryTrackingService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST surface for the tracking module.
 *
 * <p>The hot path is the {@code /ws/tracking} WebSocket — these endpoints
 * exist so the rider app has a fallback over the slow path (e.g. when
 * the socket handshake is blocked by a corporate proxy) and so customer/
 * seller apps can bootstrap the rider marker on first paint before any
 * socket frame has arrived.</p>
 *
 * <ul>
 *   <li>{@code POST /api/orders/{id}/location} — rider publishes a
 *       sample. Same authorisation rules as the socket
 *       {@code LOCATION_UPDATE} frame.</li>
 *   <li>{@code GET  /api/orders/{id}/tracking/latest} — customer /
 *       seller reads the last cached position. 404 if the rider has
 *       not sent anything yet.</li>
 * </ul>
 *
 * <p>Both endpoints share their authorisation rules with the WebSocket
 * by going through {@link DeliveryTrackingService}, so security is
 * defined exactly once.</p>
 */
@RestController
@RequestMapping("/api/orders")
public class DeliveryTrackingController {

    private final DeliveryTrackingService trackingService;

    public DeliveryTrackingController(DeliveryTrackingService trackingService) {
        this.trackingService = trackingService;
    }

    /**
     * Rider publishes a new sample. Returns the broadcast payload that
     * went out (or {@code null} when the sample was dedup'd) so the
     * client can confirm the round-trip.
     */
    @PostMapping("/{id}/location")
    public ResponseEntity<LocationUpdateMessage> postLocation(
            HttpServletRequest request,
            @PathVariable("id") Long orderId,
            @Valid @RequestBody LocationUpdateRequest body
    ) {
        Long actorId = AuthFilter.currentActorId(request);
        Role actorRole = AuthFilter.currentActorRole(request);
        LocationUpdateMessage msg = trackingService.ingest(actorId, actorRole, orderId, body);
        return ResponseEntity.ok(msg);
    }

    /**
     * Customer / seller reads the latest cached position for
     * {@code orderId}. Returns 200 with a {@code LocationUpdateMessage}
     * (possibly with {@code lat=NaN} when the rider has not moved yet)
     * — or 404 if the order has no rider assigned at all.
     */
    @GetMapping("/{id}/tracking/latest")
    public ResponseEntity<LocationUpdateMessage> latest(
            HttpServletRequest request,
            @PathVariable("id") Long orderId
    ) {
        Long actorId = AuthFilter.currentActorId(request);
        Role actorRole = AuthFilter.currentActorRole(request);
        trackingService.authorizeViewer(actorId, actorRole, orderId);
        LocationUpdateMessage cached = trackingService.latest(orderId);
        if (cached == null) {
            return ResponseEntity.ok(LocationUpdateMessage.empty(orderId));
        }
        return ResponseEntity.ok(cached);
    }
}