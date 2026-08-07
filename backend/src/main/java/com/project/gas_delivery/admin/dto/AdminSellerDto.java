package com.project.gas_delivery.admin.dto;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * A seller row for the admin sellers screen: the user record, the business
 * details from {@code seller_profiles}, the permit status from
 * {@code seller_permits}, and the catalogue size from {@code products}.
 *
 * <p>{@code permitStatus} is {@code null} for the V3 seed sellers, which
 * have no permit row at all — {@link
 * com.project.gas_delivery.seller.service.SellerProfileService} treats
 * "active user, no permit row" as approved, and this DTO preserves that
 * distinction rather than inventing a status.</p>
 */
public record AdminSellerDto(
        String id,
        String fullName,
        String username,
        String email,
        String phone,
        boolean isActive,
        Instant createdAt,

        // seller_profiles — null when the seller never completed a profile
        String businessName,
        String address,
        String district,
        String region,
        String ward,
        String street,
        BigDecimal rating,
        Boolean openNow,
        Double lat,
        Double lng,

        // seller_permits — null when no application row exists
        String permitStatus,
        Instant permitSubmittedAt,
        Instant permitReviewedAt,
        String rejectionReason,

        /** Size of this seller's catalogue, active and inactive rows alike. */
        long productCount
) {
}
