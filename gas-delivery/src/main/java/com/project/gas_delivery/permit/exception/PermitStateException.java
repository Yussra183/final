package com.project.gas_delivery.permit.exception;

/**
 * Raised for permit workflow violations that don't fit other categories —
 * duplicate submission while a permit is still pending, missing required
 * documents, attempting to upload the wrong file type, etc. Mapped to HTTP
 * 409 with {@code code=PERMIT_STATE} by the global exception handler.
 */
public class PermitStateException extends RuntimeException {
    public PermitStateException(String message) {
        super(message);
    }
}
