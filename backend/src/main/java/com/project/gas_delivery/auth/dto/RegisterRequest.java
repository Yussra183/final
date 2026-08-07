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
 *
 * <p><strong>Seller fields (added in V12):</strong> {@code
 * businessName}, {@code businessRegion}, {@code businessDistrict},
 * {@code businessWard}, {@code businessStreet}, {@code businessAddress},
 * {@code businessLat}, {@code businessLng} are optional and only used
 * when {@code role == SELLER}. When present, the registration writes
 * both the user row and the {@code seller_profiles} row inside the
 * same transaction — the seller no longer logs in to find an
 * "Address not set" placeholder.</p>
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
        Role role,

        // ---- Seller-only business fields (all optional) ----

        @Size(max = 160, message = "Business name must be 160 characters or fewer")
        String businessName,

        @Size(max = 120, message = "Region must be 120 characters or fewer")
        String businessRegion,

        @Size(max = 120, message = "District must be 120 characters or fewer")
        String businessDistrict,

        @Size(max = 120, message = "Ward must be 120 characters or fewer")
        String businessWard,

        @Size(max = 160, message = "Street must be 160 characters or fewer")
        String businessStreet,

        @Size(max = 500, message = "Business address must be 500 characters or fewer")
        String businessAddress,

        Double businessLat,
        Double businessLng
) {
}