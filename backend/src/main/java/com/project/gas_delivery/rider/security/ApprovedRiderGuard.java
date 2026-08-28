package com.project.gas_delivery.rider.security;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.repository.RiderApplicationRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

/**
 * Role + verification guard for rider-only endpoints that perform
 * business activities (toggling availability, publishing GPS, etc.).
 *
 * <p>{@link com.project.gas_delivery.auth.security.SecurityConfig} permits
 * all requests and no {@code @PreAuthorize} annotations are used anywhere
 * in this codebase — authorisation is enforced in the controller layer by
 * reading the actor attributes {@link AuthFilter} puts on the request.
 * This class is the rider-side analogue of
 * {@link com.project.gas_delivery.admin.AdminGuard}: it bundles the
 * role check + the {@code rider_applications.status = APPROVED} check so
 * every rider controller can call one method instead of re-implementing
 * the same two-step gate.</p>
 *
 * <p>The route guards in {@code RiderVerificationController} are
 * intentionally pre-approval (a pending rider must be able to upload
 * documents and submit their application) — those endpoints should
 * keep using a role-only helper, NOT this class.</p>
 */
@Component
public class ApprovedRiderGuard {

    private final RiderApplicationRepository riderApplicationRepository;

    public ApprovedRiderGuard(RiderApplicationRepository riderApplicationRepository) {
        this.riderApplicationRepository = riderApplicationRepository;
    }

    /**
     * Asserts the caller is an authenticated rider whose application is
     * currently {@link PermitStatus#APPROVED}.
     *
     * @return the rider's user id, for callers that need to record who
     *         performed an action
     * @throws NotAuthorizedException if the request carries no valid token,
     *         the token belongs to a non-rider, or the rider's
     *         application is not yet APPROVED
     */
    public Long requireApprovedRider(HttpServletRequest request) {
        Long actorId = AuthFilter.currentActorId(request);
        Role role = AuthFilter.currentActorRole(request);
        if (actorId == null || role == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        if (role != Role.RIDER) {
            throw new NotAuthorizedException("Only riders can access this resource.");
        }
        boolean approved = riderApplicationRepository
                .findRiderIdsByStatus(PermitStatus.APPROVED)
                .contains(actorId);
        if (!approved) {
            throw new NotAuthorizedException(
                    "Your rider application is pending admin approval.");
        }
        return actorId;
    }
}