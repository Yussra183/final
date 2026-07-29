package com.project.gas_delivery.admin.dto;

import java.time.Instant;

/**
 * A row of the {@code seller_riders} join table, with both parties' names
 * resolved — backs the admin rider-assignments screen, which previously
 * had no read endpoint at all.
 */
public record AdminAssignmentDto(
        String sellerId,
        String sellerName,
        String businessName,
        String riderId,
        String riderName,
        boolean riderAvailable,
        Instant assignedAt
) {
}
