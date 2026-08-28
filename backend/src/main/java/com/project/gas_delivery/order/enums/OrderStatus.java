package com.project.gas_delivery.order.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Order Flow lifecycle states.
 *
 * <p>Stored in the database as the uppercase enum name (via
 * {@code @Enumerated(EnumType.STRING)}) and exposed on the JSON wire in
 * lowercase so it matches the frontend's {@code OrderStatus} literal types
 * (e.g. {@code "pending"}, {@code "accepted"}, {@code "picked_up"},
 * {@code "in_transit"}, {@code "delivered"}, {@code "cancelled"},
 * {@code "rejected"}).</p>
 *
 * <p>Terminal states ({@link #DELIVERED}, {@link #CANCELLED},
 * {@link #REJECTED}) admit no further transitions.</p>
 */
public enum OrderStatus {
    PENDING,
    ACCEPTED,
    ASSIGNED,
    /**
     * Rider has reached the seller's pickup point and is waiting for the
     * seller to confirm physical handover. Sits between {@link #ASSIGNED}
     * and {@link #PICKED_UP} so the system can distinguish "rider is on
     * the way", "rider is asking for handover", and "rider physically
     * has the package".
     */
    PICKUP_CONFIRMATION_PENDING,
    PICKED_UP,
    IN_TRANSIT,
    DELIVERED,
    CANCELLED,
    REJECTED;

    /** Lowercase wire format consumed by the React Native frontend. */
    @JsonValue
    public String toJson() {
        return switch (this) {
            case PENDING -> "pending";
            case ACCEPTED -> "accepted";
            case ASSIGNED -> "assigned";
            case PICKUP_CONFIRMATION_PENDING -> "pickup_pending";
            case PICKED_UP -> "picked_up";
            case IN_TRANSIT -> "in_transit";
            case DELIVERED -> "delivered";
            case CANCELLED -> "cancelled";
            case REJECTED -> "rejected";
        };
    }

    /**
     * Accept either the lowercase wire form (preferred) or the enum
     * name (case-insensitive) when deserialising.
     */
    @JsonCreator
    public static OrderStatus fromJson(String value) {
        if (value == null) return null;
        String normalised = value.trim().toLowerCase();
        for (OrderStatus s : values()) {
            if (s.toJson().equals(normalised) || s.name().equalsIgnoreCase(value.trim())) {
                return s;
            }
        }
        throw new IllegalArgumentException("Unknown order status: " + value);
    }
}
