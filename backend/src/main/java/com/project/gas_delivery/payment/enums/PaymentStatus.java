package com.project.gas_delivery.payment.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Payment lifecycle states.
 *
 * <p>Stored in the database as the uppercase enum name (via
 * {@code @Enumerated(EnumType.STRING)}) and exposed on the JSON wire in
 * lowercase so it matches the frontend's {@code PaymentStatus} literal type.</p>
 *
 * <p>Terminal states: {@link #COMPLETED}, {@link #FAILED}, {@link #REFUNDED}.
 * A {@code PENDING} payment can be advanced to {@code COMPLETED} (pay-now),
 * {@code FAILED} (gateway declined) or {@code REFUNDED} (cancelled after
 * capture). A {@code COMPLETED} payment can also be {@code REFUNDED} if the
 * order is rejected after payment.</p>
 */
public enum PaymentStatus {
    PENDING,
    COMPLETED,
    FAILED,
    REFUNDED;

    /** Lowercase wire format consumed by the React Native frontend. */
    @JsonValue
    public String toJson() {
        return switch (this) {
            case PENDING -> "pending";
            case COMPLETED -> "completed";
            case FAILED -> "failed";
            case REFUNDED -> "refunded";
        };
    }

    @JsonCreator
    public static PaymentStatus fromJson(String value) {
        if (value == null) return null;
        String normalised = value.trim().toLowerCase();
        for (PaymentStatus s : values()) {
            if (s.toJson().equals(normalised) || s.name().equalsIgnoreCase(value.trim())) {
                return s;
            }
        }
        throw new IllegalArgumentException("Unknown payment status: " + value);
    }
}
