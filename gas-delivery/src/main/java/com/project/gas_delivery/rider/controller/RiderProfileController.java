package com.project.gas_delivery.rider.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.rider.dto.AssignedSellerDto;
import com.project.gas_delivery.rider.dto.RiderContactPatch;
import com.project.gas_delivery.rider.dto.RiderProfileDto;
import com.project.gas_delivery.rider.service.RiderProfileService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
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
 *   <li>{@code GET /api/riders/me} — the signed-in rider's own profile
 *       (full name, email, region, district, address, vehicle, licence,
 *       national ID, account status).</li>
 *   <li>{@code PATCH /api/riders/me} — the signed-in rider updates only
 *       their personal contact / location information (phone, region,
 *       district, address, lat, lng). Requires the application to be
 *       APPROVED — refuses with 403 otherwise so a pending rider
 *       cannot edit their contact details before the admin review.</li>
 *   <li>{@code GET /api/riders/me/assigned-seller} — the seller the rider
 *       is currently assigned to (read-only). Returns 204 when no
 *       assignment exists yet so the rider profile can surface the
 *       "not yet assigned" message verbatim.</li>
 *   <li>{@code GET /api/riders/me/team} — the seller the rider is
 *       currently assigned to plus every other approved rider sharing
 *       that seller assignment. Used by the Rider Profile / "My Team"
 *       page; the current rider is flagged with {@code isMe = true} so
 *       the client can highlight their own row.</li>
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

    /**
     * Patch the signed-in rider's contact / location information. Only
     * the fields in {@link RiderContactPatch} are mutable — application
     * number, national ID, driving licence number, approval status,
     * assigned seller and rider certificate are intentionally omitted so
     * a malformed request can't accidentally escalate a rider's
     * permissions.
     */
    @PatchMapping("/api/riders/me")
    public RiderProfileDto updateMyContact(
            HttpServletRequest request,
            @RequestBody RiderContactPatch patch
    ) {
        Long riderId = requireRider(request);
        if (patch == null) {
            patch = new RiderContactPatch(null, null, null, null, null, null);
        }
        return riderProfileService.updateContact(riderId, patch);
    }

    /**
     * Return the signed-in rider's own profile. The actor id is read from
     * the bearer-token-resolved request attributes — riders can never
     * fetch another rider's profile via this endpoint.
     */
    @GetMapping("/api/riders/me")
    public RiderProfileDto me(HttpServletRequest request) {
        Long riderId = requireRider(request);
        return riderProfileService.getMe(riderId);
    }

    /**
     * Return the seller the signed-in rider is currently assigned to, or
     * HTTP 204 (no body) when no assignment exists yet.
     *
     * <p>204 keeps the contract simple for the React Native client:
     * {@code api.get} rejects on non-2xx, so callers either get the
     * payload OR catch the 204 with a {@link org.springframework.web.client.HttpClientErrorException}
     * short-circuit (mirrored on the frontend via a separate
     * {@code assignedSellerOrNull} helper).</p>
     */
    @GetMapping("/api/riders/me/assigned-seller")
    public ResponseEntity<AssignedSellerDto> assignedSeller(HttpServletRequest request) {
        Long riderId = requireRider(request);
        return riderProfileService.getAssignedSeller(riderId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /**
     * Return the rider's seller + every other approved rider sharing
     * that seller. The signed-in rider is implicitly part of the team —
     * the client highlights their own row by matching the user id.
     */
    @GetMapping("/api/riders/me/team")
    public com.project.gas_delivery.rider.dto.RiderTeamDto myTeam(
            HttpServletRequest request
    ) {
        Long riderId = requireRider(request);
        return riderProfileService.getTeam(riderId);
    }

    private static Long requireRider(HttpServletRequest request) {
        Long actorId = AuthFilter.currentActorId(request);
        Role role = AuthFilter.currentActorRole(request);
        if (actorId == null || role == null) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "Authentication required.");
        }
        if (role != Role.RIDER) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "Only riders can view their rider profile.");
        }
        return actorId;
    }
}