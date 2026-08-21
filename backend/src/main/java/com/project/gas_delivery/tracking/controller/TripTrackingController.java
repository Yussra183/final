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
 * REST surface for the supplier delivery-operation trip-tracking
 * channel. Mirrors {@link DeliveryTrackingController} for the
 * additive trip-keyed path introduced by the supplier
 * delivery-operations feature.
 *
 * <ul>
 *   <li>{@code POST /api/trips/{id}/location} — the trip's assigned
 *       rider (or owning supplier) publishes a sample. Same
 *       authorisation rules as the WebSocket
 *       {@code LOCATION_UPDATE} frame with a {@code tripId} field.</li>
 *   <li>{@code GET  /api/trips/{id}/tracking/latest} — seller (if on
 *       the route) reads the last cached position, otherwise
 *       403. Returns 200 with a {@code LocationUpdateMessage}
 *       (possibly with {@code lat=NaN} when the publisher has not
 *       moved yet).</li>
 * </ul>
 *
 * <p>The hot path is still the {@code /ws/tracking} WebSocket — these
 * endpoints exist so the supplier/rider device has a REST fallback
 * when the socket handshake is blocked, and so the seller app can
 * bootstrap the marker on first paint before any socket frame has
 * arrived.</p>
 */
@RestController
@RequestMapping("/api/trips")
public class TripTrackingController {

    private final DeliveryTrackingService trackingService;

    public TripTrackingController(DeliveryTrackingService trackingService) {
        this.trackingService = trackingService;
    }

    @PostMapping("/{id}/location")
    public ResponseEntity<LocationUpdateMessage> postLocation(
            HttpServletRequest request,
            @PathVariable("id") Long tripId,
            @Valid @RequestBody LocationUpdateRequest body
    ) {
        Long actorId = AuthFilter.currentActorId(request);
        Role actorRole = AuthFilter.currentActorRole(request);
        LocationUpdateMessage msg =
                trackingService.ingestForTrip(actorId, actorRole, tripId, body);
        return ResponseEntity.ok(msg);
    }

    @GetMapping("/{id}/tracking/latest")
    public ResponseEntity<LocationUpdateMessage> latest(
            HttpServletRequest request,
            @PathVariable("id") Long tripId
    ) {
        Long actorId = AuthFilter.currentActorId(request);
        Role actorRole = AuthFilter.currentActorRole(request);
        trackingService.authorizeTripViewer(actorId, actorRole, tripId);
        LocationUpdateMessage cached = trackingService.latestTrip(tripId);
        if (cached == null) {
            return ResponseEntity.ok(LocationUpdateMessage.tripLocation(
                    tripId, null, Double.NaN, Double.NaN,
                    null, null, null, null, null));
        }
        return ResponseEntity.ok(cached);
    }
}