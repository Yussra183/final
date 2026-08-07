package com.project.gas_delivery.auth.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Roles available in the gas-delivery platform.
 * <p>
 * Stored in the database as the uppercase name (via
 * {@code @Enumerated(EnumType.STRING)}) and exposed on the JSON wire in
 * lowercase so it matches the frontend's {@code UserRole} literal types
 * (e.g. {@code "customer"}, {@code "seller"}, {@code "supplier"},
 * {@code "rider"}, {@code "admin"}).
 * </p>
 */
public enum Role {
    CUSTOMER,
    SELLER,
    SUPPLIER,
    RIDER,
    ADMIN;

    /** Lowercase wire format consumed by the React Native frontend. */
    @JsonValue
    public String toJson() {
        return name().toLowerCase();
    }

    /**
     * Accept either the lowercase wire form (preferred) or the enum
     * name (case-insensitive) when deserialising.
     */
    @JsonCreator
    public static Role fromJson(String value) {
        if (value == null) return null;
        String normalised = value.trim().toUpperCase();
        for (Role r : values()) {
            if (r.name().equals(normalised)) return r;
        }
        throw new IllegalArgumentException("Unknown role: " + value);
    }
}