package com.project.gas_delivery.rider.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.repository.RiderApplicationRepository;
import com.project.gas_delivery.rider.dto.AssignedSellerDto;
import com.project.gas_delivery.rider.dto.RiderContactPatch;
import com.project.gas_delivery.rider.dto.RiderProfileDto;
import com.project.gas_delivery.rider.dto.RiderTeamDto;
import com.project.gas_delivery.rider.dto.RiderTeamMemberDto;
import com.project.gas_delivery.rider.entity.RiderProfileEntity;
import com.project.gas_delivery.rider.entity.SellerRiderEntity;
import com.project.gas_delivery.rider.repository.RiderProfileRepository;
import com.project.gas_delivery.rider.repository.SellerRiderRepository;
import com.project.gas_delivery.seller.entity.SellerProfileEntity;
import com.project.gas_delivery.seller.repository.SellerProfileRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.HashSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Read &amp; write access to rider profiles and seller↔rider assignments.
 *
 * <p>For MVP:
 * <ul>
 *   <li>Any caller can list riders and see who's available.</li>
 *   <li>Sellers can see their assigned team via
 *       {@link #listAssignedToSeller(Long)}.</li>
 *   <li>Riders can flip their own availability flag via
 *       {@link #setAvailability(Long, Long, boolean)}.</li>
 *   <li>Riders can fetch their own profile via {@link #getMe(Long)}.</li>
 *   <li>Riders can read their assigned seller via
 *       {@link #getAssignedSeller(Long)}.</li>
 * </ul>
 * </p>
 */
@Service
public class RiderProfileService {

    private final RiderProfileRepository riderProfileRepository;
    private final SellerRiderRepository sellerRiderRepository;
    private final SellerProfileRepository sellerProfileRepository;
    private final UserRepository userRepository;
    private final RiderApplicationRepository riderApplicationRepository;
    private final com.project.gas_delivery.notification.service.NotificationService notificationService;

    public RiderProfileService(RiderProfileRepository riderProfileRepository,
                               SellerRiderRepository sellerRiderRepository,
                               SellerProfileRepository sellerProfileRepository,
                               UserRepository userRepository,
                               RiderApplicationRepository riderApplicationRepository,
                               com.project.gas_delivery.notification.service.NotificationService notificationService) {
        this.riderProfileRepository = riderProfileRepository;
        this.sellerRiderRepository = sellerRiderRepository;
        this.sellerProfileRepository = sellerProfileRepository;
        this.userRepository = userRepository;
        this.riderApplicationRepository = riderApplicationRepository;
        this.notificationService = notificationService;
    }

    @Transactional(readOnly = true)
    public List<RiderProfileDto> listAll(Boolean availableOnly) {
        List<RiderProfileEntity> profiles = availableOnly != null && availableOnly
                ? riderProfileRepository.findByAvailable(true)
                : riderProfileRepository.findAll();
        return map(profiles);
    }

    @Transactional(readOnly = true)
    public List<RiderProfileDto> listAssignedToSeller(Long sellerId) {
        List<Long> riderIds = sellerRiderRepository.findBySellerId(sellerId).stream()
                .map(SellerRiderEntity::getRiderId)
                .toList();
        if (riderIds.isEmpty()) return List.of();
        List<RiderProfileEntity> profiles = riderProfileRepository.findAllById(riderIds);
        return map(profiles);
    }

    @Transactional
    public RiderProfileDto getMe(Long riderId) {
        // Newly-registered riders don't have a `rider_profiles` row yet
        // — auth/register only creates a `users` row. The Profile screen
        // hits this endpoint on first login, so we lazy-create a default
        // row instead of throwing a 404. The fix is additive: every
        // existing caller still gets the same `RiderProfileDto` shape.
        RiderProfileEntity profile = riderProfileRepository.findById(riderId)
                .orElseGet(() -> riderProfileRepository.save(
                        new RiderProfileEntity(
                                riderId,
                                "motorcycle", // vehicleType default
                                null, // vehiclePlate
                                null, // vehicleModel
                                null, // licenseNo
                                true, // available
                                null, // phone — taken from `users` later
                                null, // lat
                                null, // lng
                                null, null, null, null // region/district/address/nationalId
                        )));
        User user = userRepository.findById(riderId).orElse(null);
        return RiderProfileDto.from(profile, user);
    }

    /**
     * Return the {@link AssignedSellerDto} for the seller this rider is
     * currently assigned to, or {@link Optional#empty()} when no
     * assignment exists yet.
     *
     * <p>The brief requires that <em>every</em> rider be assigned to
     * <em>exactly one</em> seller, but existing seeded riders may
     * currently have multiple rows in {@code seller_riders}; we surface
     * the oldest assignment (by assignedAt) so the screen has a
     * deterministic single seller to display. The rider cannot edit or
     * select this assignment — that is exclusively an admin operation.</p>
     */
    @Transactional(readOnly = true)
    public Optional<AssignedSellerDto> getAssignedSeller(Long riderId) {
        List<SellerRiderEntity> assignments = sellerRiderRepository.findByRiderId(riderId);
        if (assignments.isEmpty()) {
            return Optional.empty();
        }
        SellerRiderEntity assignment = assignments.stream()
                .min((a, b) -> {
                    if (a.getAssignedAt() == null && b.getAssignedAt() == null) return 0;
                    if (a.getAssignedAt() == null) return 1;
                    if (b.getAssignedAt() == null) return -1;
                    return a.getAssignedAt().compareTo(b.getAssignedAt());
                })
                .orElse(assignments.get(0));
        Long sellerId = assignment.getSellerId();
        SellerProfileEntity profile = sellerProfileRepository.findById(sellerId).orElse(null);
        if (profile == null) {
            // Defensive: the seller row may have been hard-deleted even
            // though the join row survives — surface the assignment from
            // the users table instead.
            User sellerUser = userRepository.findById(sellerId).orElse(null);
            if (sellerUser == null) return Optional.empty();
            return Optional.of(new AssignedSellerDto(
                    String.valueOf(sellerUser.getId()),
                    sellerUser.getFullName(),
                    null,
                    sellerUser.getPhone(),
                    null, null, null));
        }
        User sellerUser = userRepository.findById(sellerId).orElse(null);
        return Optional.of(AssignedSellerDto.from(profile, sellerUser));
    }

    @Transactional
    public RiderProfileDto setAvailability(Long riderId, Long actorId, boolean available) {
        if (!riderId.equals(actorId)) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "You can only update your own availability.");
        }
        // Lazy-create the profile row so a rider toggling their
        // availability flag without ever opening the Profile screen
        // first doesn't crash the dispatch flow.
        RiderProfileEntity profile = riderProfileRepository.findById(riderId)
                .orElseGet(() -> riderProfileRepository.save(
                        new RiderProfileEntity(
                                riderId,
                                "motorcycle",
                                null, null, null,
                                available,
                                null,
                                null, null,
                                null, null, null, null)));
        profile.setAvailable(available);
        RiderProfileEntity saved = riderProfileRepository.save(profile);
        String fullName = userRepository.findById(saved.getUserId())
                .map(User::getFullName)
                .orElse(null);
        boolean active = userRepository.findById(saved.getUserId())
                .map(User::isActive)
                .orElse(false);
        return RiderProfileDto.from(saved, fullName, active);
    }

    private List<RiderProfileDto> map(List<RiderProfileEntity> profiles) {
        if (profiles.isEmpty()) return List.of();

        List<Long> userIds = profiles.stream().map(RiderProfileEntity::getUserId).toList();
        Map<Long, User> users = new HashMap<>();
        for (User u : userRepository.findAllById(userIds)) {
            if (u.getRole() == Role.RIDER) users.put(u.getId(), u);
        }

        // Drop riders whose verification application is not yet APPROVED
        // — the dispatch queue should never surface unverified riders.
        // We resolve the approved set in a single bulk query rather than
        // touching each row individually so the cost stays O(1) round-trips.
        Set<Long> approvedRiderIds = new HashSet<>(
                riderApplicationRepository.findRiderIdsByStatus(PermitStatus.APPROVED));

        return profiles.stream()
                .filter(p -> users.containsKey(p.getUserId()))
                .filter(p -> approvedRiderIds.contains(p.getUserId()))
                .map(p -> {
                    User u = users.get(p.getUserId());
                    return RiderProfileDto.from(p, u.getFullName(), u.isActive());
                })
                .toList();
    }

    /**
     * Patch the signed-in rider's personal contact / location fields.
     * Application status guard: only {@link PermitStatus#APPROVED}
     * riders can edit their contact details, matching the brief —
     * "After the Rider has been approved by the Admin, allow the Rider
     * to update ONLY personal contact information".
     *
     * <p>A {@code null} field on {@link RiderContactPatch} is treated as
     * "no change" so callers can PATCH a subset of fields. An empty
     * string clears the column. The mutable fields are exactly the
     * ones the brief lists (phone, region, district, address, lat,
     * lng) — national ID, driving licence, vehicle details, application
     * number, approval status and seller assignment are intentionally
     * absent from the patch so they can't be tampered with here.</p>
     */
    @Transactional
    public RiderProfileDto updateContact(Long riderId, RiderContactPatch patch) {
        // The signed-in rider must have an APPROVED rider_application
        // before contact edits are honoured. Pending / rejected riders
        // bounce back with 403 — the brief requires "after approval".
        Set<Long> approvedIds = new HashSet<>(
                riderApplicationRepository.findRiderIdsByStatus(PermitStatus.APPROVED));
        if (!approvedIds.contains(riderId)) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "Rider contact information can only be updated after your application has been approved by the administrator.");
        }

        // Lazy-create the row so a rider who toggles their contact
        // before opening the Profile screen doesn't crash. Same pattern
        // as getMe / setAvailability.
        RiderProfileEntity profile = riderProfileRepository.findById(riderId)
                .orElseGet(() -> riderProfileRepository.save(
                        new RiderProfileEntity(
                                riderId,
                                "motorcycle",
                                null, null, null,
                                true,
                                null,
                                null, null,
                                null, null, null, null)));
        if (patch.phone() != null) profile.setPhone(trimToNull(patch.phone()));
        if (patch.region() != null) profile.setRegion(trimToNull(patch.region()));
        if (patch.district() != null) profile.setDistrict(trimToNull(patch.district()));
        if (patch.address() != null) profile.setAddress(trimToNull(patch.address()));
        if (patch.lat() != null) profile.setLat(patch.lat());
        if (patch.lng() != null) profile.setLng(patch.lng());

        RiderProfileEntity saved = riderProfileRepository.save(profile);

        // Mirror the contact phone onto the users row so the admin
        // directory (and other surfaces that read `users.phone`) sees
        // the latest value. Region / district / address / GPS stay on
        // rider_profiles where they belong.
        if (patch.phone() != null) {
            String trimmed = trimToNull(patch.phone());
            User user = userRepository.findById(riderId).orElse(null);
            if (user != null && (trimmed == null || !trimmed.equals(user.getPhone()))) {
                user.setPhone(trimmed);
                userRepository.save(user);
            }
        }

        User user = userRepository.findById(saved.getUserId()).orElse(null);

        // Notify the rider (and every admin via the existing
        // notification fan-out) that contact information changed. The
        // brief requires "Admin should always see the latest Rider
        // information", so the admin directory screen picking up the
        // next `GET /api/admin/users` cycle reflects this without any
        // extra work. The rider-side notification gives the rider a
        // success confirmation surfacing on the bell icon.
        notificationService.notify(
                riderId,
                "system",
                "Rider Profile Updated",
                "Your contact information has been updated successfully.",
                "{\"riderId\":\"" + riderId + "\"}"
        );

        return RiderProfileDto.from(saved, user);
    }

    /**
     * Resolve the seller a rider is currently assigned to, plus every
     * other approved rider sharing that seller assignment. Used by the
     * Rider Profile / "My Team" screen — the caller flags the row whose
     * {@code userId} matches the signed-in rider so the UI can highlight
     * it.
     *
     * <p>If the rider has not yet been assigned to a seller, the seller
     * portion of the returned DTO is {@code null} and the riders list is
     * empty (we never leak riders from other sellers when the caller has
     * no team).</p>
     */
    @Transactional(readOnly = true)
    public RiderTeamDto getTeam(Long riderId) {
        Optional<AssignedSellerDto> seller = getAssignedSeller(riderId);
        if (seller.isEmpty()) {
            return new RiderTeamDto(null, List.of());
        }
        Long sellerId = Long.parseLong(seller.get().sellerId());
        List<SellerRiderEntity> rows = sellerRiderRepository.findBySellerId(sellerId);
        List<Long> riderIds = rows.stream()
                .map(SellerRiderEntity::getRiderId)
                .filter(id -> !id.equals(riderId)) // exclude the caller — surfaced as isMe on the existing row
                .toList();
        if (riderIds.isEmpty()) {
            return new RiderTeamDto(seller.get(), List.of());
        }

        // Bulk-load the rider rows + users in two round-trips so the
        // endpoint stays O(1) HTTP queries regardless of team size.
        List<RiderProfileEntity> profiles = riderProfileRepository.findAllById(riderIds);
        Map<Long, User> users = new HashMap<>();
        for (User u : userRepository.findAllById(riderIds)) {
            if (u.getRole() == Role.RIDER) users.put(u.getId(), u);
        }
        Set<Long> approved = new HashSet<>(
                riderApplicationRepository.findRiderIdsByStatus(PermitStatus.APPROVED));

        List<RiderTeamMemberDto> members = new ArrayList<>();
        for (RiderProfileEntity p : profiles) {
            User u = users.get(p.getUserId());
            if (u == null) continue;
            if (!approved.contains(p.getUserId())) continue; // skip not-yet-approved teammates
            members.add(RiderTeamMemberDto.from(p, u, false));
        }
        return new RiderTeamDto(seller.get(), members);
    }

    /**
     * Trim {@code value} to {@code null} when blank so we never persist
     * empty strings where the column is nullable.
     */
    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}