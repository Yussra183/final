package com.project.gas_delivery.auth.dto;

import com.project.gas_delivery.auth.entity.User;

import java.time.Instant;

/**
 * Safe projection of a {@link User} for the JSON wire — never exposes
 * the password hash. Field names and types match the frontend's
 * {@code User} interface in {@code constants/types.ts}.
 */
public record UserDto(
        String id,
        String fullName,
        String username,
        String email,
        String phone,
        String role,
        Instant createdAt
) {
    public static UserDto from(User u) {
        return new UserDto(
                String.valueOf(u.getId()),
                u.getFullName(),
                u.getUsername(),
                u.getEmail(),
                u.getPhone(),
                u.getRole().toJson(),
                u.getCreatedAt()
        );
    }
}