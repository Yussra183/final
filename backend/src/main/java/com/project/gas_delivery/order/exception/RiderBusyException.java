package com.project.gas_delivery.order.exception;

/**
 * Thrown when a rider tries to claim an order that has already been claimed
 * by another rider (the atomic UPDATE matched zero rows because
 * {@code rider_id} is no longer null). Mapped to HTTP 409 by the global
 * exception handler with {@code code=RIDER_BUSY}.
 */
public class RiderBusyException extends RuntimeException {
    public RiderBusyException(String message) {
        super(message);
    }
}
