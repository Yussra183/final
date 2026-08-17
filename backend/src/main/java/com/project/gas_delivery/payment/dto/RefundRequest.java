package com.project.gas_delivery.payment.dto;

import jakarta.validation.constraints.Size;

/**
 * Request body for {@code POST /api/payments/{id}/refund}.
 *
 * @param reason human-readable explanation persisted with the refund
 */
public record RefundRequest(
        @Size(max = 500) String reason
) {}
