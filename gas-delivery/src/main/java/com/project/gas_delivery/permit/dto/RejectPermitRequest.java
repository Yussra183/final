package com.project.gas_delivery.permit.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Payload for {@code POST /api/admin/permits/{id}/reject}. The
 * {@code reason} becomes the seller-facing rejection message and is
 * persisted on {@code seller_permits.rejection_reason}.
 */
public record RejectPermitRequest(
        @NotBlank(message = "reason is required")
        @Size(min = 5, max = 1000, message = "reason must be between 5 and 1000 characters")
        String reason
) {
}
