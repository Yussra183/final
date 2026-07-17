package com.project.gas_delivery.auth.exception;

/**
 * Thrown for client errors that aren't covered by bean validation —
 * e.g. attempting to register an email that already exists.
 * Mapped to HTTP 400 by the global exception handler.
 */
public class BadRequestException extends RuntimeException {
    public BadRequestException(String message) {
        super(message);
    }
}