package com.project.gas_delivery.order.entity;

import java.math.BigDecimal;

/**
 * Snapshot of a single line item captured at order creation time.
 *
 * <p>Persisted inside the {@code items} JSONB column of the {@code orders}
 * table — not a separate relational table. Hibernate 6 +
 * {@code @JdbcTypeCode(SqlTypes.JSON)} round-trips this record via Jackson
 * automatically; the wire shape (camelCase fields) matches the frontend's
 * {@code OrderItem} interface in {@code constants/types.ts}.</p>
 */
public record OrderItemEmbeddable(
        String productId,
        String productName,
        String size,
        int quantity,
        BigDecimal unitPrice
) {
}
