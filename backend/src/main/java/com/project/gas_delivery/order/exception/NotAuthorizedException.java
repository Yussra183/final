package com.project.gas_delivery.order.exception;

/**
 * Thrown when the actor's role doesn't match the order's owner
 * (e.g. a different customer tries to cancel, a different seller tries to
 * accept, or a rider tries to advance an order assigned to someone else).
 * Mapped to HTTP 403 by the global exception handler with
 * {@code code=NOT_AUTHORIZED}.
 */
public class NotAuthorizedException extends RuntimeException {
    public NotAuthorizedException(String message) {
        super(message);
    }
}
