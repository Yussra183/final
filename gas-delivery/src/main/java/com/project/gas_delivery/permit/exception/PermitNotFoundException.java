package com.project.gas_delivery.permit.exception;

/**
 * Raised when a permit (or permit document) cannot be located. Mapped to
 * HTTP 404 with {@code code=PERMIT_NOT_FOUND} by the global exception
 * handler.
 */
public class PermitNotFoundException extends RuntimeException {
    public PermitNotFoundException(String message) {
        super(message);
    }
}
