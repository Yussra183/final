package com.project.gas_delivery.payment.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Payment methods accepted by the simulated payment gateway.
 *
 * <p>Stored as uppercase enum names in the DB and exposed as lowercase
 * strings on the wire so the frontend can render method badges
 * consistently.</p>
 *
 * <p>This is a <em>simulation</em>: no actual M-Pesa / card / bank API is
 * called. Each method still validates a minimal shape (e.g. an M-Pesa
 * payment carries a phone number) and synthesises a {@code transactionRef}
 * so the UI flow looks identical to what a real integration would
 * produce.</p>
 */
public enum PaymentMethod {
    CASH,
    MPESA,
    CARD,
    BANK;

    @JsonValue
    public String toJson() {
        return switch (this) {
            case CASH -> "cash";
            case MPESA -> "mpesa";
            case CARD -> "card";
            case BANK -> "bank";
        };
    }

    @JsonCreator
    public static PaymentMethod fromJson(String value) {
        if (value == null) return null;
        String normalised = value.trim().toLowerCase();
        for (PaymentMethod m : values()) {
            if (m.toJson().equals(normalised) || m.name().equalsIgnoreCase(value.trim())) {
                return m;
            }
        }
        throw new IllegalArgumentException("Unknown payment method: " + value);
    }
}
