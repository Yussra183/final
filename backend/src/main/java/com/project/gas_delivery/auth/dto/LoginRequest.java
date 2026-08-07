package com.project.gas_delivery.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Payload for {@code POST /api/auth/login}.
 * <p>
 * {@code identifier} may be a username OR an email — the service layer
 * decides which lookup to perform.
 * </p>
 */
public record LoginRequest(

        @NotBlank(message = "Username or email is required")
        @Size(max = 180)
        String identifier,

        @NotBlank(message = "Password is required")
        @Size(min = 1, max = 100)
        String password
) {
}