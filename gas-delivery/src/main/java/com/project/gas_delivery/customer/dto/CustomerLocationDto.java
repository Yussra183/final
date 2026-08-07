package com.project.gas_delivery.customer.dto;

import com.project.gas_delivery.customer.entity.CustomerProfileEntity;

/**
 * Wire shape for {@code GET /api/customers/me} and
 * {@code PUT /api/customers/me} — the customer's saved location.
 *
 * <p>Field names match the frontend's Location Information card
 * ({@code app/(customer)/profile.tsx}) and the {@code User} interface in
 * {@code constants/types.ts}, so the store can merge the response onto
 * {@code session.user} without any field remapping.</p>
 *
 * <p>Every field is nullable so the same record serves three purposes:</p>
 * <ul>
 *   <li><strong>Read, never saved:</strong> an all-null instance is
 *       returned for a customer who has not set a location yet — the
 *       Profile screen renders empty inputs rather than erroring.</li>
 *   <li><strong>Write:</strong> {@code region}, {@code district} and
 *       {@code street} are required by
 *       {@code CustomerProfileService.upsertMe}; {@code address} is
 *       composed from the parts when blank.</li>
 *   <li><strong>Coordinates:</strong> {@code lat}/{@code lng} are
 *       optional on the way in — the service geocodes the address when
 *       they're absent — and always populated on the way out.</li>
 * </ul>
 */
public record CustomerLocationDto(
        String region,
        String district,
        String ward,
        String street,
        String address,
        Double lat,
        Double lng
) {

    /** Project a persisted row onto the wire. */
    public static CustomerLocationDto from(CustomerProfileEntity e) {
        return new CustomerLocationDto(
                e.getRegion(),
                e.getDistrict(),
                e.getWard(),
                e.getStreet(),
                e.getAddress(),
                e.getLat(),
                e.getLng()
        );
    }

    /**
     * The "no location saved yet" response. Returned by
     * {@code GET /api/customers/me} when the customer has never saved,
     * so the Profile screen gets a 200 with empty fields instead of a
     * 404 it would have to special-case.
     */
    public static CustomerLocationDto empty() {
        return new CustomerLocationDto(null, null, null, null, null, null, null);
    }
}
