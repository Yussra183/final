package com.project.gas_delivery.customer.dto;

/**
 * Wire shape for {@code PATCH /api/customers/me} — the customer's
 * editable personal fields stored on {@code users}
 * ({@code fullName}, {@code username}, {@code email}, {@code phone}).
 *
 * <p>Defined separately from {@link CustomerLocationDto} because the
 * two DTOs back two genuinely different endpoints — PATCH for personal
 * info, PUT for saved location — and the field sets don't overlap.
 * Reusing one DTO would force callers to send empty location fields
 * whenever they wanted to update a phone number.</p>
 *
 * <p>Every field is optional; {@code null} / blank leaves the stored
 * value untouched. Server-side validation rejects the empty-string
 * form of each field so a half-cleared form can never land an
 * obviously broken value.</p>
 */
public record CustomerProfilePatchDto(
        String fullName,
        String username,
        String email,
        String phone
) {
}
