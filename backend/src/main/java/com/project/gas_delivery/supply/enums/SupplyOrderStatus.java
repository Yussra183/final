package com.project.gas_delivery.supply.enums;

/**
 * Lifecycle states for a {@code supply_orders} row (FR-06).
 *
 * <pre>
 *   PENDING ──accept──▶ ACCEPTED ──startPrepare──▶ PREPARING ──dispatch──▶ DISPATCHED ──deliver──▶ DELIVERED ──receive──▶ RECEIVED (terminal)
 *      │                  │                            │                            │                       │
 *      │ reject           │ cancel                     │ cancel                     │ cancel                 │
 *      ▼                  ▼                            ▼                            ▼
 *   REJECTED          CANCELLED                     CANCELLED                     CANCELLED
 * </pre>
 *
 * <p>The JSON wire form is lowercase to match the frontend's existing
 * {@code RestockRequest["status"]} union.</p>
 */
public enum SupplyOrderStatus {
    PENDING,
    ACCEPTED,
    PREPARING,
    DISPATCHED,
    DELIVERED,
    RECEIVED,
    REJECTED,
    CANCELLED;

    /** Convert to the lowercase form used on the wire. */
    public String toJson() {
        return name().toLowerCase();
    }

    /** True when the row is in a terminal state and admits no further transitions. */
    public boolean isTerminal() {
        return this == RECEIVED || this == REJECTED || this == CANCELLED;
    }
}
