package com.project.gas_delivery.supply.exception;

/**
 * Typed exception raised when a supply-order transition is rejected
 * (illegal state, unauthorised role, missing reason, etc.).
 *
 * <p>Maps to HTTP 400/403/409 from {@code GlobalExceptionHandler}; the
 * wire code carries a stable enum-style token the frontend can switch
 * on without parsing messages.</p>
 */
public class SupplyOrderException extends RuntimeException {

    public enum Kind {
        NOT_FOUND,
        FORBIDDEN,
        ILLEGAL_TRANSITION,
        REASON_REQUIRED,
        SUPPLIER_NOT_APPROVED,
        SELF_REQUEST,
        /** Raised when the seller requests a gas brand / size combination that
         *  the canonical {@code GasCatalog} does not list. */
        INVALID_GAS_COMBINATION
    }

    private final Kind kind;

    public SupplyOrderException(Kind kind, String message) {
        super(message);
        this.kind = kind;
    }

    public Kind getKind() {
        return kind;
    }
}
