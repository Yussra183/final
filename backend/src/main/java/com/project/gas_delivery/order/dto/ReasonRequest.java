package com.project.gas_delivery.order.dto;

import jakarta.validation.constraints.Size;

/**
 * Optional reason payload shared by {@code POST /api/orders/{id}/reject}
 * and {@code POST /api/orders/{id}/cancel}.
 */
public record ReasonRequest(
        @Size(max = 500)
        String reason
) {
}
