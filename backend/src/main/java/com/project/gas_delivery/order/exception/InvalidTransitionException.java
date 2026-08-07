package com.project.gas_delivery.order.exception;

/**
 * Thrown when the requested status transition isn't allowed by the order
 * state machine — either because the (from, to) pair isn't in the
 * transition table, or because the actor's role isn't permitted to fire it.
 * Mapped to HTTP 409 by the global exception handler with
 * {@code code=INVALID_TRANSITION}.
 */
public class InvalidTransitionException extends RuntimeException {
    public InvalidTransitionException(String message) {
        super(message);
    }
}
