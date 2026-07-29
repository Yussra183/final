package com.project.gas_delivery.permit.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Lifecycle status of a seller's permit application.
 * <p>
 * Mirrors the frontend's {@code SellerPermitStatus} type
 * ({@code constants/types.ts}). Wire form is lowercase; the database stores
 * the uppercase enum name.
 * </p>
 *
 * <ul>
 *   <li>{@link #PENDING}      – seller uploaded all three PDFs but admin
 *                               has not picked the application up yet.</li>
 *   <li>{@link #UNDER_REVIEW} – admin opened the application but has not
 *                               decided.</li>
 *   <li>{@link #APPROVED}     – admin approved. Flip
 *                               {@code users.is_active} to TRUE so the
 *                               customer / rider queries return the
 *                               seller.</li>
 *   <li>{@link #REJECTED}     – admin rejected with a reason. The seller
 *                               may re-upload documents and re-submit,
 *                               which produces a fresh {@link #PENDING}
 *                               row.</li>
 * </ul>
 */
public enum PermitStatus {
    PENDING,
    UNDER_REVIEW,
    APPROVED,
    REJECTED;

    /** Lowercase wire format consumed by the React Native frontend. */
    @JsonValue
    public String toJson() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static PermitStatus fromJson(String value) {
        if (value == null) return null;
        String normalised = value.trim().toUpperCase();
        for (PermitStatus s : values()) {
            if (s.name().equals(normalised)) return s;
        }
        throw new IllegalArgumentException("Unknown permit status: " + value);
    }
}
