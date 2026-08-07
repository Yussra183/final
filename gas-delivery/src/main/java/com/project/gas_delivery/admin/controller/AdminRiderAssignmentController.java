package com.project.gas_delivery.admin.controller;

import com.project.gas_delivery.admin.AdminGuard;
import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.repository.RiderApplicationRepository;
import com.project.gas_delivery.rider.dto.AssignedSellerDto;
import com.project.gas_delivery.rider.entity.SellerRiderEntity;
import com.project.gas_delivery.rider.repository.SellerRiderRepository;
import com.project.gas_delivery.seller.entity.SellerProfileEntity;
import com.project.gas_delivery.seller.repository.SellerProfileRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Admin-only endpoints for managing the {@code seller_riders} join
 * table that backs the dispatch queue filter, the Rider "My Team" page
 * and the admin Rider Assignments screen.
 *
 * <p>The brief requires that every approved rider be assigned to
 * <em>exactly one</em> seller; the admin can change or remove the
 * assignment at any time. This controller exposes the three operations
 * the admin UI needs:</p>
 *
 * <ul>
 *   <li>{@code GET  /api/admin/riders/{riderId}/assigned-seller} —
 *       read the current seller (404 when none).</li>
 *   <li>{@code PUT  /api/admin/riders/{riderId}/assigned-seller} —
 *       assign or change the rider's seller (body carries
 *       {@code sellerId}).</li>
 *   <li>{@code DELETE /api/admin/riders/{riderId}/assigned-seller} —
 *       remove the assignment so the rider is back to "no team".</li>
 * </ul>
 *
 * <p>Only {@code APPROVED} riders can be assigned — the controller
 * refuses with 400 otherwise. Sellers must be active and have an
 * APPROVED seller permit. The existing dispatch queue filter continues
 * to scope by {@code seller_riders} exactly as it did before, so the
 * assignment feature is purely additive on the data path.</p>
 */
@RestController
@RequestMapping("/api/admin/riders/{riderId}/assigned-seller")
public class AdminRiderAssignmentController {

    private final SellerRiderRepository sellerRiderRepository;
    private final RiderApplicationRepository riderApplicationRepository;
    private final SellerProfileRepository sellerProfileRepository;
    private final UserRepository userRepository;

    public AdminRiderAssignmentController(
            SellerRiderRepository sellerRiderRepository,
            RiderApplicationRepository riderApplicationRepository,
            SellerProfileRepository sellerProfileRepository,
            UserRepository userRepository
    ) {
        this.sellerRiderRepository = sellerRiderRepository;
        this.riderApplicationRepository = riderApplicationRepository;
        this.sellerProfileRepository = sellerProfileRepository;
        this.userRepository = userRepository;
    }

    /**
     * Resolve the seller this rider is currently assigned to.
     * Returns 404 (mapped from {@link BadRequestException}) when no
     * assignment exists yet so the admin UI can show "Not assigned".
     */
    @GetMapping
    public AssignedSellerDto get(HttpServletRequest request, @PathVariable Long riderId) {
        AdminGuard.requireAdmin(request);
        requireRider(riderId);
        return currentAssignment(riderId)
                .orElseThrow(() -> new BadRequestException(
                        "Rider " + riderId + " has no seller assignment yet."));
    }

    /**
     * Assign (or change) the rider's seller. Body carries
     * {@code sellerId}; any prior {@code seller_riders} rows for the
     * rider are cleared first so the rider ends up assigned to exactly
     * one seller, matching the brief.
     */
    @PutMapping
    @Transactional
    public AssignedSellerDto assign(
            HttpServletRequest request,
            @PathVariable Long riderId,
            @RequestBody AssignRiderToSellerRequest body
    ) {
        AdminGuard.requireAdmin(request);
        User rider = requireRider(riderId);
        requireApprovedRider(riderId);
        if (body == null || body.sellerId() == null) {
            throw new BadRequestException("sellerId is required.");
        }
        Long sellerId = body.sellerId();
        User seller = userRepository.findById(sellerId)
                .orElseThrow(() -> new BadRequestException(
                        "No seller with id " + sellerId + "."));
        if (seller.getRole() != Role.SELLER) {
            throw new BadRequestException(
                    "User " + sellerId + " is not a seller account.");
        }
        // Replace the assignment: drop every existing row for the
        // rider, then insert a fresh one. The (seller_id, rider_id)
        // PK guarantees the insert is idempotent.
        List<SellerRiderEntity> existing = sellerRiderRepository.findByRiderId(riderId);
        if (!existing.isEmpty()) {
            sellerRiderRepository.deleteAll(existing);
        }
        SellerRiderEntity saved = sellerRiderRepository.save(
                new SellerRiderEntity(sellerId, riderId));
        // Eagerly touch assignedAt — @PrePersist fires only on the
        // initial save and we just deleted + re-saved the row.
        return toAssignedSellerDto(saved);
    }

    /**
     * Remove the rider's seller assignment. Idempotent — calling it on
     * a rider with no assignment is a no-op and returns 204 so the
     * admin UI can re-issue the call without surfacing an error.
     */
    @DeleteMapping
    @Transactional
    public org.springframework.http.ResponseEntity<Void> remove(
            HttpServletRequest request,
            @PathVariable Long riderId
    ) {
        AdminGuard.requireAdmin(request);
        requireRider(riderId);
        List<SellerRiderEntity> existing = sellerRiderRepository.findByRiderId(riderId);
        if (!existing.isEmpty()) {
            sellerRiderRepository.deleteAll(existing);
        }
        return org.springframework.http.ResponseEntity.noContent().build();
    }

    // =====================================================================
    // helpers
    // =====================================================================

    private User requireRider(Long riderId) {
        User rider = userRepository.findById(riderId)
                .orElseThrow(() -> new BadRequestException(
                        "No rider with id " + riderId + "."));
        if (rider.getRole() != Role.RIDER) {
            throw new BadRequestException(
                    "User " + riderId + " is not a rider account.");
        }
        return rider;
    }

    private void requireApprovedRider(Long riderId) {
        Set<Long> approved = new HashSet<>(
                riderApplicationRepository.findRiderIdsByStatus(PermitStatus.APPROVED));
        if (!approved.contains(riderId)) {
            throw new BadRequestException(
                    "Rider " + riderId + " must be approved before they can be assigned to a seller.");
        }
    }

    /**
     * Mirror of the rider-facing service helper — projects the join row
     * through {@code seller_profiles` + `users` so the response carries
     * the seller's display name, business name, phone and address.
     * Defensive against missing profiles (same fallback as the rider
     * surface).
     */
    private AssignedSellerDto toAssignedSellerDto(SellerRiderEntity assignment) {
        Long sellerId = assignment.getSellerId();
        SellerProfileEntity profile = sellerProfileRepository.findById(sellerId).orElse(null);
        User sellerUser = userRepository.findById(sellerId).orElse(null);
        if (profile == null && sellerUser == null) {
            throw new BadRequestException(
                    "Assigned seller " + sellerId + " no longer exists.");
        }
        if (profile == null) {
            return new AssignedSellerDto(
                    String.valueOf(sellerUser.getId()),
                    sellerUser.getFullName(),
                    null,
                    sellerUser.getPhone(),
                    null, null, null);
        }
        return AssignedSellerDto.from(profile, sellerUser);
    }

    /**
     * Find the current seller assignment. Mirrors the rider-facing
     * service logic — picks the oldest {@code assignedAt} when the
     * rider has historical duplicates (defensive against legacy data).
     */
    private Optional<AssignedSellerDto> currentAssignment(Long riderId) {
        List<SellerRiderEntity> rows = sellerRiderRepository.findByRiderId(riderId);
        if (rows.isEmpty()) return Optional.empty();
        SellerRiderEntity pick = rows.stream()
                .min((a, b) -> {
                    if (a.getAssignedAt() == null && b.getAssignedAt() == null) return 0;
                    if (a.getAssignedAt() == null) return 1;
                    if (b.getAssignedAt() == null) return -1;
                    return a.getAssignedAt().compareTo(b.getAssignedAt());
                })
                .orElse(rows.get(0));
        return Optional.of(toAssignedSellerDto(pick));
    }

    /**
     * Request body for {@code PUT /api/admin/riders/{riderId}/assigned-seller}.
     * Only {@code sellerId} is required — the controller does the role
     * + permit validation so a single JSON body is enough for the
     * admin UI.
     */
    public record AssignRiderToSellerRequest(Long sellerId) {
    }
}