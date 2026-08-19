package com.project.gas_delivery.supply.enums;

/**
 * Lifecycle states for a {@code supply_orders} row (FR-06).
 *
 * <pre>
 *   PENDING ──accept──▶ ACCEPTED ──startPrepare──▶ PREPARING ──dispatch──▶ DISPATCHED ──confirmReceipt──▶ DELIVERED (terminal)
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

    /** True when the row is in a terminal state and admits no further transitions.
     *
     * <p>Per the diagram, {@link #DELIVERED} is now the seller's terminal
     * transition (confirmed receipt credits inventory). {@link #RECEIVED}
     * remains in the enum as a legacy value for backwards compatibility
     * with rows written before this change but is no longer terminal and
     * should not be written by any code path.</p>
     */
    public boolean isTerminal() {
        return this == DELIVERED || this == REJECTED || this == CANCELLED;
    }
}
