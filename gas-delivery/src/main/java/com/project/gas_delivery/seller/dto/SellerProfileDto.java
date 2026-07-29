package com.project.gas_delivery.seller.dto;

import com.project.gas_delivery.seller.entity.SellerProfileEntity;

import java.math.BigDecimal;

/**
 * Wire form of a seller profile.
 *
 * <p>Mirrors the frontend's {@code SellerProfile} interface in
 * {@code constants/types.ts}. {@code sellerId} is the string form of the
 * user's numeric id — keeps the wire contract identical to the auth
 * {@code UserDto}.</p>
 */
public record SellerProfileDto(
        String sellerId,
        String sellerName,
        String businessName,
        String location,
        Double distanceKm,
        String phone,
        BigDecimal rating,
        String[] availableSizes,
        boolean openNow,
        Double lat,
        Double lng
) {

    public static SellerProfileDto from(SellerProfileEntity e, String sellerName, double distanceKm,
                                        String[] availableSizes) {
        return new SellerProfileDto(
                String.valueOf(e.getUserId()),
                sellerName,
                e.getBusinessName(),
                e.getAddress(),
                distanceKm,
                e.getPhone(),
                e.getRating(),
                availableSizes,
                e.isOpenNow(),
                e.getLat(),
                e.getLng()
        );
    }
}