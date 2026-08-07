package com.project.gas_delivery.admin.dto;

import com.project.gas_delivery.auth.entity.User;

import java.time.Instant;

/**
 * A row in the admin user directory.
 *
 * <p>Superset of {@link com.project.gas_delivery.auth.dto.UserDto} — adds
 * {@code isActive} and {@code updatedAt}, which admins need and ordinary
 * callers don't. The auth DTO is left untouched.</p>
 */
public record AdminUserDto(
        String id,
        String fullName,
        String username,
        String email,
        String phone,
        String role,
        boolean isActive,
        Instant createdAt,
        Instant updatedAt
) {

    public static AdminUserDto from(User u) {
        return new AdminUserDto(
                String.valueOf(u.getId()),
                u.getFullName(),
                u.getUsername(),
                u.getEmail(),
                u.getPhone(),
                u.getRole().toJson(),
                u.isActive(),
                u.getCreatedAt(),
                u.getUpdatedAt()
        );
    }
}
