package com.project.gas_delivery.auth.exception;

import org.springframework.security.core.AuthenticationException;

/**
 * Thrown by the auth module when a seller with correct credentials tries
 * to log in but their permit is still awaiting admin review (status
 * {@code PENDING} or {@code UNDER_REVIEW}). Mapped to HTTP 403 with
 * {@code code=ACCOUNT_PENDING_APPROVAL} by the global exception handler.
 *
 * <p>Distinct from {@link AccountRejectedException} (terminal rejection)
 * and from Spring's {@code BadCredentialsException} (wrong password /
 * unknown identifier) so the frontend can render a specific message
 * instead of the generic "Invalid email or password" alert.</p>
 *
 * <p>This exception is only raised AFTER the password has been verified,
 * so it cannot be used to enumerate valid seller usernames — the only
 * way to trigger it is to know the correct password for a known
 * pending/review account.</p>
 */
public class AccountPendingApprovalException extends AuthenticationException {

    /** Lowercase permit status, e.g. {@code "pending"} or {@code "under_review"}. */
    private final String status;

    public AccountPendingApprovalException(String status) {
        super("Your account is waiting for admin approval.");
        this.status = status;
    }

    public String getStatus() {
        return status;
    }
}
