package com.project.gas_delivery.admin;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import jakarta.servlet.http.HttpServletRequest;

/**
 * Role guard shared by every admin controller.
 *
 * <p>{@link com.project.gas_delivery.auth.security.SecurityConfig} permits
 * all requests and no {@code @PreAuthorize} annotations are used anywhere
 * in this codebase — authorisation is enforced in the controller layer by
 * reading the actor attributes {@link AuthFilter} puts on the request. This
 * class holds the one copy of that check so the admin controllers don't
 * each carry their own.</p>
 */
public final class AdminGuard {

    private AdminGuard() {
    }

    /**
     * Asserts the caller is an authenticated administrator.
     *
     * @return the admin's user id, for callers that need to record who
     *         performed an action
     * @throws NotAuthorizedException if the request carries no valid token
     *         or the token belongs to a non-admin
     */
    public static Long requireAdmin(HttpServletRequest request) {
        Long actorId = AuthFilter.currentActorId(request);
        Role role = AuthFilter.currentActorRole(request);
        if (actorId == null || role == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        if (role != Role.ADMIN) {
            throw new NotAuthorizedException("Only administrators can access this resource.");
        }
        return actorId;
    }
}
