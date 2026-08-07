package com.project.gas_delivery.rider.dto;

import com.project.gas_delivery.seller.entity.SellerProfileEntity;
import com.project.gas_delivery.auth.entity.User;

/**
 * Read-only summary of the seller a rider is currently assigned to.
 *
 * <p>Surfaced by {@code GET /api/riders/me/assigned-seller}. When no
 * seller has been assigned yet the endpoint returns {@code null} (HTTP
 * 204 with no body) so the rider profile screen can show the "not yet
 * assigned" message verbatim.</p>
 *
 * <p>Riders cannot edit or select their seller — the assignment is
 * managed exclusively by the administrator. The rider-facing screen
 * reads this DTO for display purposes only.</p>
 */
public record AssignedSellerDto(
        String sellerId,
        String sellerName,
        String businessName,
        String phone,
        String location,
        String district,
        String region
) {

    public static AssignedSellerDto from(SellerProfileEntity profile, User user) {
        String sellerName = user == null ? null : user.getFullName();
        String phone = profile.getPhone();
        if ((phone == null || phone.isBlank()) && user != null) {
            phone = user.getPhone();
        }
        return new AssignedSellerDto(
                String.valueOf(profile.getUserId()),
                sellerName,
                profile.getBusinessName(),
                phone,
                profile.getAddress(),
                profile.getDistrict(),
                profile.getRegion()
        );
    }
}