package com.project.gas_delivery.tracking.exception;

/**
 * Thrown by the tracking service when the order id embedded in a location
 * update or subscribe frame does not resolve to an existing order. Maps
 * to HTTP 404. Kept separate from the order module's
 * {@code OrderNotFoundException} so the {@code GlobalExceptionHandler}
 * can attach a {@code code=TRACKING_ORDER_NOT_FOUND} without polluting
 * the order flow's error vocabulary.
 */
public class TrackingOrderNotFoundException extends RuntimeException {
    public TrackingOrderNotFoundException(String message) {
        super(message);
    }
}