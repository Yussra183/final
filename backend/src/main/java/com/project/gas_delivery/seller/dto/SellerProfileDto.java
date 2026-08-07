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
        /**
         * Boxed {@code Boolean} (not primitive {@code boolean}) so the
         * PATCH path — which is bound straight from JSON via the
         * canonical record constructor — accepts a missing
         * {@code openNow} key. The frontend's {@code Partial<SellerProfile>}
         * patch is allowed to omit fields; with a primitive
         * {@code boolean} the missing key defaults to {@code null},
         * which Jackson rejects as
         * {@code HttpMessageNotReadableException: Cannot map `null` into
         * type `boolean`} and the whole request 500s. Boxed here is a
         * wire-only concession: the entity still uses primitive
         * {@code boolean} (a saved profile always has an open-now flag),
         * and {@link #from(SellerProfileEntity, String, double, String[])}
         * always passes a non-null value, so the JSON response shape is
         * unchanged for clients.
         */
        Boolean openNow,
        Double lat,
        Double lng,
        /** Admin / district view of where the Business Address sits. */
        String region,
        String district,
        /** Ward and street inside the selected district. Added in V12
         *  so the values the seller types at registration round-trip
         *  through the backend instead of being silently dropped. */
        String ward,
        String street
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
                e.getLng(),
                e.getRegion(),
                e.getDistrict(),
                e.getWard(),
                e.getStreet()
        );
    }
}