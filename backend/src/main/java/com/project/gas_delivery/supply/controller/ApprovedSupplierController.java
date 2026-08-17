package com.project.gas_delivery.supply.controller;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.permit.service.SupplierApplicationService;
import com.project.gas_delivery.supply.dto.ApprovedSupplierDto;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * FR-06 — {@code GET /api/suppliers/approved}.
 *
 * <p>Returns every supplier whose {@code supplier_applications} row has
 * status {@code APPROVED}. Used by the seller's "Restock" form to
 * populate the supplier picker with only currently-eligible names
 * (rather than letting the seller raise an order against a supplier
 * whose application is still PENDING — which {@code SupplyOrderService}
 * would reject at create-time but the UI should never have offered in
 * the first place).</p>
 *
 * <p>Any authenticated user can call this endpoint; only SELLERs have a
 * real reason to but we don't restrict the read because the wire shape
 * is intentionally minimal (public business contact info).</p>
 */
@RestController
public class ApprovedSupplierController {

    private final SupplierApplicationService supplierApplicationService;
    private final UserRepository userRepository;

    public ApprovedSupplierController(SupplierApplicationService supplierApplicationService,
                                      UserRepository userRepository) {
        this.supplierApplicationService = supplierApplicationService;
        this.userRepository = userRepository;
    }

    @GetMapping("/api/suppliers/approved")
    public List<ApprovedSupplierDto> listApproved(HttpServletRequest request) {
        // Require any authenticated actor — the endpoint is open but
        // shouldn't be reachable anonymously. AuthFilter.currentActorId
        // returns null for unauthenticated callers.
        Long actorId = AuthFilter.currentActorId(request);
        if (actorId == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        Role role = AuthFilter.currentActorRole(request);
        if (role == null || role == Role.RIDER || role == Role.CUSTOMER) {
            throw new NotAuthorizedException(
                    "Only sellers, suppliers, and admins can list approved suppliers.");
        }

        List<com.project.gas_delivery.permit.entity.SupplierApplicationEntity> applications =
                supplierApplicationService.findApprovedApplications();

        if (applications.isEmpty()) {
            return List.of();
        }
        // Bulk-load users so we issue one query rather than N. We don't
        // assume the foreign-key ordering matches — collect to a map.
        List<Long> ids = applications.stream()
                .map(com.project.gas_delivery.permit.entity.SupplierApplicationEntity::getSupplierId)
                .toList();
        Map<Long, User> suppliersById = userRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        List<ApprovedSupplierDto> out = new ArrayList<>(applications.size());
        for (com.project.gas_delivery.permit.entity.SupplierApplicationEntity app : applications) {
            User user = suppliersById.get(app.getSupplierId());
            if (user == null || !user.isActive()) {
                // Skip if the user record was deleted or deactivated after
                // approval — the supplier is no longer eligible.
                continue;
            }
            out.add(ApprovedSupplierDto.from(user, app));
        }
        return out;
    }
}
