package com.project.gas_delivery.order.dto;

import com.project.gas_delivery.order.enums.OrderStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Payload for {@code PATCH /api/orders/{id}/status}.
 *
 * <p>Used by the rider to advance delivery milestones
 * ({@code picked_up}, {@code in_transit}, {@code delivered}). {@code note}
 * is accepted on the wire for forward-compatibility but is not persisted
 * in MVP — a future migration can add a {@code last_note} column.</p>
 */
public record UpdateStatusRequest(
        @NotNull(message = "status is required")
        OrderStatus status,

        @Size(max = 500)
        String note
) {
}
