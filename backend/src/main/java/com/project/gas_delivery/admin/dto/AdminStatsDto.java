package com.project.gas_delivery.admin.dto;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Everything the admin dashboard renders, in one round trip.
 *
 * <p>Each field is a {@code COUNT(*)} or {@code SUM(...)} against a real
 * table — no value here is estimated or derived from a sample.</p>
 */
public record AdminStatsDto(
        // Directory headcounts
        long totalUsers,
        long totalCustomers,
        long totalSellers,
        long totalRiders,
        long totalSuppliers,
        long totalAdmins,

        // Catalogue + order volume
        long totalProducts,
        long totalOrders,
        OrderStatusCountsDto orderStatus,
        long activeOrders,

        // Seller applications (seller_permits)
        long pendingSellerApplications,
        long underReviewSellerApplications,
        long approvedSellers,
        long rejectedSellerApplications,

        // Notifications
        long totalNotifications,

        /** Realised revenue: the sum of totals across delivered orders. */
        BigDecimal revenueDelivered,

        /** When the server computed this snapshot. */
        Instant generatedAt
) {
}
