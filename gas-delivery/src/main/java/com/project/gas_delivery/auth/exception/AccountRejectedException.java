package com.project.gas_delivery.auth.exception;

import org.springframework.security.core.AuthenticationException;

/**
 * Thrown by the auth module when a seller with correct credentials tries
 * to log in but their permit application was rejected by the admin. Mapped
 * to HTTP 403 with {@code code=ACCOUNT_REJECTED} by the global exception
 * handler. The seller can re-upload documents and submit a fresh
 * application once the rejection reason is addressed.
 *
 * <p>Like {@link AccountPendingApprovalException}, this is only raised
 * AFTER the password has been verified, so it cannot be used to enumerate
 * valid seller usernames.</p>
 */
public class AccountRejectedException extends AuthenticationException {

    private final String rejectionReason;

    public AccountRejectedException(String rejectionReason) {
        super(buildMessage(rejectionReason));
        this.rejectionReason = rejectionReason;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    private static String buildMessage(String reason) {
        if (reason == null || reason.isBlank()) {
            return "Your permit application was rejected.";
        }
        return "Your permit application was rejected. Reason: " + reason.trim() + ".";
    }
}
