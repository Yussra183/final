package com.project.gas_delivery.admin.dto;

import java.time.Instant;

/**
 * A rider row for the admin riders screen: the user record, the vehicle
 * details from {@code rider_profiles}, and the workload aggregates from a
 * single grouped query over {@code orders}.
 *
 * <p>{@code lat}/{@code lng} are the coordinates stored on the rider's
 * profile, not a live position — live tracking is a WebSocket stream and
 * is not persisted to a queryable table.</p>
 */
public record AdminRiderDto(
        String id,
        String fullName,
        String username,
        String email,
        String phone,
        boolean isActive,
        Instant createdAt,

        // rider_profiles — null when the rider never completed a profile
        String vehicleType,
        String vehiclePlate,
        String vehicleModel,
        String licenseNo,
        boolean available,
        Double lat,
        Double lng,

        /** Orders currently in this rider's hands (assigned → in transit). */
        long assignedOrders,

        /** Orders this rider has delivered, lifetime. */
        long completedDeliveries,

        /** Sellers this rider is assigned to via {@code seller_riders}. */
        long assignedSellers
) {
}
