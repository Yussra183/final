package com.project.gas_delivery.order.exception;

/**
 * Thrown by the order flow when a customer requests more units of a
 * product than the seller currently has in stock.
 *
 * <p>Maps to HTTP 409 ({@code INSUFFICIENT_STOCK}) via
 * {@code GlobalExceptionHandler}. Carries the relevant product id +
 * available + requested quantities so the frontend can render a
 * "Only X left in stock" message without re-fetching the catalogue.</p>
 */
public class InsufficientStockException extends RuntimeException {

    private final String productId;
    private final String productName;
    private final int available;
    private final int requested;

    public InsufficientStockException(String productId, String productName,
                                      int available, int requested) {
        super("Insufficient stock for \"" + productName + "\": available "
                + available + ", requested " + requested + ".");
        this.productId = productId;
        this.productName = productName;
        this.available = available;
        this.requested = requested;
    }

    public String getProductId() {
        return productId;
    }

    public String getProductName() {
        return productName;
    }

    public int getAvailable() {
        return available;
    }

    public int getRequested() {
        return requested;
    }
}
