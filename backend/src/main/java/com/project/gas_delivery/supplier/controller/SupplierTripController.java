package com.project.gas_delivery.supplier.controller;

import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.supplier.dto.DeliveryTripDto;
import com.project.gas_delivery.supplier.enums.DeliveryTripStatus;
import com.project.gas_delivery.supplier.service.SupplierTripService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Supplier delivery-operation (trip) endpoints.
 *
 * <ul>
 *   <li>{@code GET /api/trips} — list trips owned by the signed-in
 *       supplier. Optional {@code ?status=planned|active|...} filter.
 *       Returns active and inactive trips.</li>
 *   <li>{@code GET /api/trips/{id}} — fetch one trip with its
 *       snapshotted stops.</li>
 *   <li>{@code POST /api/trips} — create a trip from a route. Body:
 *       {@code { routeId, riderId?, vehicleId?, supervisorName,
 *       supervisorPhone }}. Stops are snapshotted at create-time so
 *       later route edits cannot disturb the trip.</li>
 *   <li>{@code POST /api/trips/{id}/start} — transition to
 *       {@code ACTIVE}. This is the gate that makes live tracking
 *       available to sellers on the route.</li>
 *   <li>{@code POST /api/trips/{id}/complete} — transition to
 *       {@code COMPLETED}. Cached live position is cleared.</li>
 *   <li>{@code PATCH /api/trips/{id}/stops/{sellerId}} — mark a stop
 *       delivered.</li>
 * </ul>
 *
 * <p>All endpoints require the actor to be the owning supplier.</p>
 */
@RestController
public class SupplierTripController {

    private final SupplierTripService service;

    public SupplierTripController(SupplierTripService service) {
        this.service = service;
    }

    @GetMapping("/api/trips")
    public List<DeliveryTripDto> listTrips(
            HttpServletRequest request,
            @RequestParam(value = "status", required = false) String statusParam
    ) {
        Long supplierId = service.requireSupplierId(request);
        DeliveryTripStatus status = parseStatus(statusParam);
        return service.listTripsForSupplier(supplierId, status);
    }

    @GetMapping("/api/trips/{id}")
    public DeliveryTripDto getTrip(
            HttpServletRequest request,
            @PathVariable Long id
    ) {
        return service.getTrip(request, id);
    }

    @PostMapping("/api/trips")
    public DeliveryTripDto createTrip(
            HttpServletRequest request,
            @RequestBody Map<String, Object> body
    ) {
        Long routeId = longOrNull(body.get("routeId"));
        if (routeId == null) {
            throw new BadRequestException("routeId is required");
        }
        Long riderId = longOrNull(body.get("riderId"));
        Long vehicleId = longOrNull(body.get("vehicleId"));
        String supervisorName = stringOrNull(body.get("supervisorName"));
        String supervisorPhone = stringOrNull(body.get("supervisorPhone"));
        return service.createTrip(
                request, routeId, riderId, vehicleId,
                supervisorName, supervisorPhone);
    }

    @PostMapping("/api/trips/{id}/start")
    public DeliveryTripDto startTrip(
            HttpServletRequest request,
            @PathVariable Long id
    ) {
        return service.startTrip(request, id);
    }

    @PostMapping("/api/trips/{id}/complete")
    public DeliveryTripDto completeTrip(
            HttpServletRequest request,
            @PathVariable Long id
    ) {
        return service.completeTrip(request, id);
    }

    @PatchMapping("/api/trips/{id}/stops/{sellerId}")
    public DeliveryTripDto markStopDelivered(
            HttpServletRequest request,
            @PathVariable Long id,
            @PathVariable Long sellerId
    ) {
        return service.markStopDelivered(request, id, sellerId);
    }

    /* ---------------- helpers ---------------- */

    private static DeliveryTripStatus parseStatus(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return DeliveryTripStatus.fromJson(raw);
        } catch (Exception e) {
            throw new BadRequestException("Unknown status: " + raw);
        }
    }

    private static String stringOrNull(Object raw) {
        return raw == null ? null : raw.toString();
    }

    private static Long longOrNull(Object raw) {
        if (raw == null) return null;
        if (raw instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(raw.toString());
        } catch (NumberFormatException ex) {
            throw new BadRequestException("Expected a number, got: " + raw);
        }
    }
}