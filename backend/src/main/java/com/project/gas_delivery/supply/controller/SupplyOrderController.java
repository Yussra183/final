package com.project.gas_delivery.supply.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.supply.dto.CreateSupplyOrderRequest;
import com.project.gas_delivery.supply.dto.SupplyOrderDto;
import com.project.gas_delivery.supply.dto.UpdateSupplyOrderStatusRequest;
import com.project.gas_delivery.supply.service.SupplyOrderService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * FR-06 — REST surface for gas-supply orders. Routes:
 *
 * <ul>
 *   <li>{@code GET /api/restock} — list supply orders visible to the
 *       caller. SELLER → own history. SUPPLIER → own open queue.
 *       ADMIN → every row. The same endpoint shape backs the
 *       frontend's {@code RestockApi.list} callback.</li>
 *   <li>{@code GET /api/restock/unclaimed} — supplier-only view of
 *       every {@code PENDING} order without an assigned supplier.
 *       Lets suppliers "grab" work from the open pool.</li>
 *   <li>{@code GET /api/restock/{id}} — fetch a single row.</li>
 *   <li>{@code POST /api/restock} — seller-only create.</li>
 *   <li>{@code PATCH /api/restock/{id}/status} — state-machine
 *       transition. Both seller and supplier can call this; the
 *       service enforces per-role legality.</li>
 * </ul>
 *
 * <p>Auth is verified per-endpoint using {@link AuthFilter} — the
 * service layer still re-checks ownership for defence in depth.</p>
 */
@RestController
public class SupplyOrderController {

    private final SupplyOrderService service;

    public SupplyOrderController(SupplyOrderService service) {
        this.service = service;
    }

    /**
     * List the supply orders the caller is allowed to see. The optional
     * {@code scope=open} query parameter narrows the supplier view to
     * their open queue (PENDING + ACCEPTED + PREPARING + DISPATCHED)
     * which is what the supplier dashboard wants by default; omitting
     * the parameter keeps the existing "full history" behaviour for
     * backwards compatibility with the bootstrap stub.
     */
    @GetMapping("/api/restock")
    public List<SupplyOrderDto> list(HttpServletRequest request,
                                     @RequestParam(value = "scope", required = false) String scope) {
        Long actorId = requireActor(request);
        Role role = currentRole(request);
        if (role == Role.SELLER) {
            return service.listForSeller(actorId);
        }
        if (role == Role.SUPPLIER) {
            // FR-06: "open queue" is the supplier's default view.
            // The full-history view is also reachable for parity with
            // the bootstrap stub — call it via scope=all.
            return "all".equalsIgnoreCase(scope)
                    ? service.listAll().stream()
                        .filter(d -> actorId.equals(d.getSupplierId())
                                || d.getSupplierId() == null
                                || "PENDING".equalsIgnoreCase(d.getStatus()))
                        .toList()
                    : service.listForSupplier(actorId);
        }
        if (role == Role.ADMIN) {
            return service.listAll();
        }
        throw new NotAuthorizedException("Unknown role for /api/restock.");
    }

    /**
     * Open pool — every {@code PENDING} supply order without an assigned
     * supplier. Supplier-only.
     */
    @GetMapping("/api/restock/unclaimed")
    public List<SupplyOrderDto> listUnclaimed(HttpServletRequest request) {
        requireSupplier(request);
        return service.listUnclaimed();
    }

    @GetMapping("/api/restock/{id}")
    public SupplyOrderDto get(HttpServletRequest request, @PathVariable Long id) {
        Long actorId = requireActor(request);
        Role role = currentRole(request);
        return service.getById(id, role, actorId);
    }

    @PostMapping("/api/restock")
    public SupplyOrderDto create(HttpServletRequest request,
                                 @Valid @RequestBody CreateSupplyOrderRequest body) {
        Long sellerId = requireSeller(request);
        return service.create(sellerId, Role.SELLER, body);
    }

    @PatchMapping("/api/restock/{id}/status")
    public SupplyOrderDto updateStatus(HttpServletRequest request,
                                       @PathVariable Long id,
                                       @Valid @RequestBody UpdateSupplyOrderStatusRequest body) {
        Long actorId = requireActor(request);
        Role role = currentRole(request);
        return service.updateStatus(id, role, actorId, body);
    }

    // ---- auth helpers (mirrors SupplierLogisticsController) ----

    private Long requireActor(HttpServletRequest request) {
        Long actorId = AuthFilter.currentActorId(request);
        if (actorId == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        return actorId;
    }

    private Role currentRole(HttpServletRequest request) {
        Role role = AuthFilter.currentActorRole(request);
        if (role == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        return role;
    }

    private Long requireSeller(HttpServletRequest request) {
        Long actorId = requireActor(request);
        Role role = currentRole(request);
        if (role != Role.SELLER) {
            throw new NotAuthorizedException(
                    "Only sellers can raise supply orders.");
        }
        return actorId;
    }

    private Long requireSupplier(HttpServletRequest request) {
        Long actorId = requireActor(request);
        Role role = currentRole(request);
        if (role != Role.SUPPLIER) {
            throw new NotAuthorizedException(
                    "Only suppliers can browse the unclaimed supply pool.");
        }
        return actorId;
    }
}
