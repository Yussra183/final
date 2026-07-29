package com.project.gas_delivery.tracking.exception;

/**
 * Thrown when an actor attempts to read or write a tracking channel they
 * are not authorised for (e.g. a different customer peeking at someone
 * else's delivery, or a rider spoofing another rider's orderId).
 *
 * <p>Mapped to HTTP 403 by {@code GlobalExceptionHandler} via a dedicated
 * handler. Re-using the order module's {@code NotAuthorizedException}
 * would couple two unrelated subsystems, so the tracking module owns its
 * own exception type.</p>
 */
public class TrackingForbiddenException extends RuntimeException {
    public TrackingForbiddenException(String message) {
        super(message);
    }
}