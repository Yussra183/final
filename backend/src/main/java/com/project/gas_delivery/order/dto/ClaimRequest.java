package com.project.gas_delivery.order.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Payload for {@code POST /api/orders/{id}/claim}.
 *
 * <p>Both fields are required. {@code riderId} arrives as a {@link String}
 * (mirroring the frontend wire contract) and is parsed to {@code Long}
 * server-side.</p>
 */
public record ClaimRequest(
        @NotBlank(message = "riderId is required")
        String riderId,

        @NotBlank(message = "riderName is required")
        @Size(max = 120)
        String riderName
) {
}
