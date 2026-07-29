package com.project.gas_delivery.order.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.order.dto.ClaimRequest;
import com.project.gas_delivery.order.dto.CreateOrderRequest;
import com.project.gas_delivery.order.dto.OrderResponse;
import com.project.gas_delivery.order.dto.ReasonRequest;
import com.project.gas_delivery.order.dto.UpdateStatusRequest;
import com.project.gas_delivery.order.service.OrderService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST endpoints for the Order Flow.
 *
 * <p>Base path: {@code /api/orders}.</p>
 *
 * <p>The actor (id + role) is read from request attributes populated by
 * {@link AuthFilter} — no body fields are trusted for identity.</p>
 */
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    // ---- create + list -------------------------------------------------

    @PostMapping
    public ResponseEntity<OrderResponse> create(
            HttpServletRequest request,
            @Valid @RequestBody CreateOrderRequest req
    ) {
        Long actorId = requireActorId(request);
        Role actorRole = requireActorRole(request);
        OrderResponse created = orderService.create(actorId, actorRole, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping
    public List<OrderResponse> list(
            HttpServletRequest request,
            @RequestParam(required = false) String customerId,
            @RequestParam(required = false) String sellerId,
            @RequestParam(required = false) String riderId
    ) {
        Long actorId = requireActorId(request);
        Role actorRole = requireActorRole(request);
        return orderService.list(actorId, actorRole, customerId, sellerId, riderId);
    }

    // IMPORTANT: declare /dispatch/available BEFORE any /{id} mapping on
    // the controller so Spring doesn't match `dispatch` as an `{id}`.
    @GetMapping("/dispatch/available")
    public List<OrderResponse> availableForRiders(HttpServletRequest request) {
        Long actorId = requireActorId(request);
        Role actorRole = requireActorRole(request);
        return orderService.availableForRiders(actorId, actorRole);
    }

    // ---- seller decisions ----------------------------------------------

    @PostMapping("/{id}/accept")
    public OrderResponse accept(HttpServletRequest request, @PathVariable Long id) {
        Long actorId = requireActorId(request);
        Role actorRole = requireActorRole(request);
        return orderService.accept(actorId, actorRole, id);
    }

    @PostMapping("/{id}/reject")
    public OrderResponse reject(
            HttpServletRequest request,
            @PathVariable Long id,
            @RequestBody(required = false) @Valid ReasonRequest req
    ) {
        Long actorId = requireActorId(request);
        Role actorRole = requireActorRole(request);
        String reason = req == null ? null : req.reason();
        return orderService.reject(actorId, actorRole, id, reason);
    }

    // ---- customer cancel -----------------------------------------------

    @PostMapping("/{id}/cancel")
    public OrderResponse cancel(
            HttpServletRequest request,
            @PathVariable Long id,
            @RequestBody(required = false) @Valid ReasonRequest req
    ) {
        Long actorId = requireActorId(request);
        Role actorRole = requireActorRole(request);
        String reason = req == null ? null : req.reason();
        return orderService.cancel(actorId, actorRole, id, reason);
    }

    // ---- rider claim ----------------------------------------------------

    @PostMapping("/{id}/claim")
    public OrderResponse claim(
            HttpServletRequest request,
            @PathVariable Long id,
            @Valid @RequestBody ClaimRequest req
    ) {
        Long actorId = requireActorId(request);
        Role actorRole = requireActorRole(request);
        Long riderId = parseId(req.riderId(), "riderId");
        return orderService.claim(actorId, actorRole, id, riderId, req.riderName());
    }

    // ---- rider progress -------------------------------------------------

    @PatchMapping("/{id}/status")
    public OrderResponse updateStatus(
            HttpServletRequest request,
            @PathVariable Long id,
            @Valid @RequestBody UpdateStatusRequest req
    ) {
        Long actorId = requireActorId(request);
        Role actorRole = requireActorRole(request);
        return orderService.advance(actorId, actorRole, id, req.status(), req.note());
    }

    // ---- helpers --------------------------------------------------------

    private static Long requireActorId(HttpServletRequest request) {
        Long id = AuthFilter.currentActorId(request);
        if (id == null) {
            throw new AuthenticationCredentialsNotFoundException(
                    "Missing or invalid Authorization header.");
        }
        return id;
    }

    private static Role requireActorRole(HttpServletRequest request) {
        Role role = AuthFilter.currentActorRole(request);
        if (role == null) {
            throw new AuthenticationCredentialsNotFoundException(
                    "Missing or invalid Authorization header.");
        }
        return role;
    }

    private static Long parseId(String raw, String fieldName) {
        if (raw == null || raw.isBlank()) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(fieldName + " is required.");
        }
        try {
            return Long.parseLong(raw.trim());
        } catch (NumberFormatException e) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    fieldName + " must be a numeric id.");
        }
    }
}
