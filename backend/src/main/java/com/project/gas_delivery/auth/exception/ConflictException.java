package com.project.gas_delivery.auth.exception;

/**
 * Thrown when a request is well-formed but conflicts with current data
 * state — e.g. an attempt to delete or deactivate a user that is still
 * referenced by active transactions.
 *
 * <p>Mapped to HTTP 409 by the global exception handler. Carries a
 * short machine-readable {@link #getCode()} (e.g. {@code "ACTIVE_ORDERS"},
 * {@code "ACTIVE_SUPPLY_ORDERS"}) so the frontend can branch on the
 * specific blocker without parsing the human-readable message.</p>
 */
public class ConflictException extends RuntimeException {

    private final String code;

    public ConflictException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}