package com.project.gas_delivery.order.exception;

/**
 * Thrown when an order id doesn't resolve to a row in the {@code orders} table.
 * Mapped to HTTP 404 by the global exception handler with {@code code=NOT_FOUND}.
 */
public class OrderNotFoundException extends RuntimeException {
    public OrderNotFoundException(String message) {
        super(message);
    }
}
