package com.project.gas_delivery.rider.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.rider.dto.RiderProfileDto;
import com.project.gas_delivery.rider.service.RiderProfileService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST endpoints for rider profiles.
 *
 * <ul>
 *   <li>{@code GET /api/riders} — list every rider (or
 *       {@code ?available=true} for the dispatch dashboard).</li>
 *   <li>{@code GET /api/sellers/{sellerId}/riders} — list riders assigned
 *       to a particular seller (their team).</li>
 *   <li>{@code PATCH /api/riders/{riderId}/availability} — rider toggles
 *       online/offline.</li>
 * </ul>
 */
@RestController
public class RiderProfileController {

    private final RiderProfileService riderProfileService;

    public RiderProfileController(RiderProfileService riderProfileService) {
        this.riderProfileService = riderProfileService;
    }

    @GetMapping("/api/riders")
    public List<RiderProfileDto> listRiders(
            @RequestParam(required = false) Boolean available
    ) {
        return riderProfileService.listAll(available);
    }

    @GetMapping("/api/sellers/{sellerId}/riders")
    public List<RiderProfileDto> listSellerRiders(@PathVariable Long sellerId) {
        return riderProfileService.listAssignedToSeller(sellerId);
    }

    @PatchMapping("/api/riders/{riderId}/availability")
    public RiderProfileDto setAvailability(
            HttpServletRequest request,
            @PathVariable Long riderId,
            @RequestBody Map<String, Object> body
    ) {
        Long actorId = AuthFilter.currentActorId(request);
        Role actorRole = AuthFilter.currentActorRole(request);
        if (actorRole != Role.RIDER) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "Only riders can toggle availability.");
        }
        Object raw = body.get("available");
        if (raw == null) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    "available is required.");
        }
        boolean available = (raw instanceof Boolean b)
                ? b
                : Boolean.parseBoolean(raw.toString());
        return riderProfileService.setAvailability(riderId, actorId, available);
    }
}