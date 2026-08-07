package com.project.gas_delivery.auth.dto;

import com.project.gas_delivery.auth.enums.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Payload for {@code POST /api/auth/register}.
 * <p>
 * Shape mirrors {@code RegisterPayload} in the frontend's
 * {@code src/api/endpoints.ts}.
 * </p>
 */
public record RegisterRequest(

        @NotBlank(message = "Full name is required")
        @Size(min = 2, max = 120, message = "Full name must be between 2 and 120 characters")
        String fullName,

        @NotBlank(message = "Username is required")
        @Size(min = 3, max = 60, message = "Username must be between 3 and 60 characters")
        @Pattern(regexp = "^[a-zA-Z0-9_.\\-]+$",
                message = "Username may only contain letters, digits, dot, dash, underscore")
        String username,

        @NotBlank(message = "Email is required")
        @Email(message = "Email must be a valid address")
        @Size(max = 180)
        String email,

        @Pattern(regexp = "^[+0-9\\-\\s()]{6,30}$",
                message = "Phone number format is invalid")
        String phone,

        @NotBlank(message = "Password is required")
        @Size(min = 8, max = 100, message = "Password must be between 8 and 100 characters")
        String password,

        @NotNull(message = "Role is required")
        Role role
) {
}