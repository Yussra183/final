package com.project.gas_delivery.supplier.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Lifecycle states for a {@code delivery_trips} row — one execution of a
 * supplier's recurring {@link com.project.gas_delivery.supplier.entity.DeliveryRouteEntity}.
 *
 * <pre>
 *   PLANNED ──ready──▶ READY ──start──▶ ACTIVE ──complete──▶ COMPLETED (terminal)
 *      │                 │                │
 *      │ cancel          │ cancel         │ cancel
 *      ▼                 ▼                ▼
 *   CANCELLED         CANCELLED        CANCELLED  (terminal)
 * </pre>
 *
 * <p><strong>ACTIVE is the tracking gate.</strong> Sellers on the route
 * may only observe the vehicle's live position while the trip is
 * {@link #ACTIVE}; before that the backend refuses the subscription (see
 * {@code DeliveryTrackingService.authorizeTripViewer}). This is enforced
 * server-side rather than by hiding UI.</p>
 *
 * <p>Stored in the database as the uppercase enum name (via
 * {@code @Enumerated(EnumType.STRING)}) and exposed on the JSON wire in
 * lowercase, matching the convention already set by
 * {@link com.project.gas_delivery.order.enums.OrderStatus}.</p>
 */
public enum DeliveryTripStatus {
    PLANNED,
    READY,
    ACTIVE,
    COMPLETED,
    CANCELLED;

    /** Lowercase wire format consumed by the React Native frontend. */
    @JsonValue
    public String toJson() {
        return name().toLowerCase();
    }

    /**
     * Accept either the lowercase wire form (preferred) or the enum name
     * (case-insensitive) when deserialising.
     */
    @JsonCreator
    public static DeliveryTripStatus fromJson(String value) {
        if (value == null) return null;
        String normalised = value.trim().toLowerCase();
        for (DeliveryTripStatus s : values()) {
            if (s.toJson().equals(normalised) || s.name().equalsIgnoreCase(value.trim())) {
                return s;
            }
        }
        throw new IllegalArgumentException("Unknown delivery trip status: " + value);
    }

    /** True when the trip admits no further transitions. */
    public boolean isTerminal() {
        return this == COMPLETED || this == CANCELLED;
    }

    /**
     * Whether {@code next} is a legal successor of this state. Keeps the
     * state machine in one place so the service layer cannot drift.
     */
    public boolean canTransitionTo(DeliveryTripStatus next) {
        if (next == null || isTerminal()) return false;
        if (next == CANCELLED) return true;
        return switch (this) {
            case PLANNED -> next == READY || next == ACTIVE;
            case READY -> next == ACTIVE;
            case ACTIVE -> next == COMPLETED;
            default -> false;
        };
    }
}
