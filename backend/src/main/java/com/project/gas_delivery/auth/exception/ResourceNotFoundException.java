package com.project.gas_delivery.auth.exception;

/**
 * Thrown when a requested resource (typically a {@code User}) cannot be located.
 * Mapped to HTTP 404 by the global exception handler.
 */
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String message) {
        super(message);
    }
}