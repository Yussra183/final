package com.project.gas_delivery.admin.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * The admin reports payload. Every number is a {@code GROUP BY} over the
 * {@code orders} table inside the requested window — there are no sampled,
 * projected, or placeholder values here.
 */
public record AdminReportDto(
        Instant from,
        Instant to,

        long totalOrders,
        long deliveredOrders,
        long cancelledOrders,
        long rejectedOrders,

        /** Sum of totals across delivered orders in the window. */
        BigDecimal revenue,

        /** Mean value of a delivered order, or zero when none were delivered. */
        BigDecimal averageOrderValue,

        /** One entry per calendar day that had at least one order. */
        List<DailyPoint> ordersByDay,

        /** Sellers ranked by delivered revenue in the window. */
        List<TopSeller> topSellers,

        /** Order counts by status across the window. */
        OrderStatusCountsDto statusBreakdown
) {

    /** A single day's order count and revenue. */
    public record DailyPoint(String date, long orders, BigDecimal revenue) {
    }

    /** A seller's delivered volume and revenue in the window. */
    public record TopSeller(String sellerId, String sellerName, long orders, BigDecimal revenue) {
    }
}
