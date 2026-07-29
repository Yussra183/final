package com.project.gas_delivery.permit.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Payload for {@code POST /api/permits/me/submit}. The seller must have
 * already uploaded all three required documents
 * ({@code APPLICATION_FORM}, {@code BIRTH_CERTIFICATE}, {@code NATIONAL_ID})
 * before this call succeeds — the service checks that, not this DTO.
 */
public record SubmitPermitRequest(
        @NotBlank(message = "businessName is required")
        @Size(min = 2, max = 160, message = "businessName must be between 2 and 160 characters")
        String businessName
) {
}
