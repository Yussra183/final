package com.project.gas_delivery.admin.dto;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * A customer row for the admin customers screen: the user record plus the
 * two aggregates the screen displays. Both aggregates come from a single
 * grouped query over {@code orders} for the whole page.
 */
public record AdminCustomerDto(
        String id,
        String fullName,
        String username,
        String email,
        String phone,
        boolean isActive,
        Instant createdAt,

        /** Total orders this customer has ever placed. */
        long orderCount,

        /** Lifetime value: the sum of every order total, all statuses. */
        BigDecimal totalSpent
) {
}
