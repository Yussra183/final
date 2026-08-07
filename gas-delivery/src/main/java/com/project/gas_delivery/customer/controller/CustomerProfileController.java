package com.project.gas_delivery.customer.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.customer.dto.CustomerLocationDto;
import com.project.gas_delivery.customer.dto.CustomerProfilePatchDto;
import com.project.gas_delivery.customer.service.CustomerProfileService;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in customer's saved location.
 *
 * <p>{@code GET /api/customers/me} is called once after login so the
 * Profile screen and the "Nearby Sellers" pipeline both work from the
 * persisted location. {@code PUT /api/customers/me} is the save path
 * behind the Profile screen's SAVE PROFILE button.</p>
 *
 * <p>Authentication is required and the role must be
 * {@code CUSTOMER} — same guard shape as
 * {@code SellerProfileController.requireSeller} and
 * {@code RiderProfileController}. The actor id comes from the request
 * attributes {@code AuthFilter} attaches, so the customer can only ever
 * read or write <em>their own</em> location; there is no id in the path
 * to tamper with.</p>
 */
@RestController
@RequestMapping("/api/customers")
public class CustomerProfileController {

    private final CustomerProfileService customerProfileService;

    public CustomerProfileController(CustomerProfileService customerProfileService) {
        this.customerProfileService = customerProfileService;
    }

    /**
     * Read the saved location. Returns an all-null payload (200, not
     * 404) when the customer has never saved one.
     */
    @GetMapping("/me")
    public CustomerLocationDto me(HttpServletRequest request) {
        return customerProfileService.me(requireCustomer(request));
    }

    /**
     * Create or update the saved location. Validates the payload and
     * geocodes the address, then returns the persisted row — including
     * the resolved {@code lat}/{@code lng}, which the client caches for
     * the session.
     */
    @PutMapping("/me")
    public CustomerLocationDto updateMe(
            HttpServletRequest request,
            @RequestBody CustomerLocationDto patch
    ) {
        return customerProfileService.upsertMe(requireCustomer(request), patch);
    }

    /**
     * Patch the signed-in customer's editable personal fields
     * (full name, username, email, phone) on the {@code users} row.
     * Each field is optional; only present fields are written.
     *
     * <p>This is the destination of the Profile screen's "personal
     * information" half of the save flow. The location half goes
     * through {@link #updateMe(HttpServletRequest, CustomerLocationDto)}
     * to {@code PUT /api/customers/me}. Keeping the two operations
     * on the same controller (rather than introducing a brand-new
     * admin-style {@code /api/users/{id}} route) keeps the
     * "customer owns their own profile" security model in one
     * place — the actor id still comes from
     * {@link AuthFilter#currentActorId(HttpServletRequest)}, and the
     * client never gets to address a different user.</p>
     */
    @PatchMapping("/me")
    public CustomerProfilePatchDto patchMe(
            HttpServletRequest request,
            @RequestBody CustomerProfilePatchDto patch
    ) {
        return customerProfileService.patchPersonal(requireCustomer(request), patch);
    }

    private static Long requireCustomer(HttpServletRequest request) {
        Long actorId = AuthFilter.currentActorId(request);
        Role role = AuthFilter.currentActorRole(request);
        if (actorId == null || role == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        if (role != Role.CUSTOMER) {
            throw new NotAuthorizedException("Only customers can manage their own location.");
        }
        return actorId;
    }
}
