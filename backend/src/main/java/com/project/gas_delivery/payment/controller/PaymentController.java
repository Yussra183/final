package com.project.gas_delivery.payment.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.payment.dto.PayRequest;
import com.project.gas_delivery.payment.dto.PaymentResponse;
import com.project.gas_delivery.payment.dto.RefundRequest;
import com.project.gas_delivery.payment.service.PaymentService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST endpoints for the Payment Flow.
 *
 * <p>Base path: {@code /api/payments}. All routes require an
 * authenticated actor; the actor's id + role are read from request
 * attributes populated by {@link AuthFilter}.</p>
 */
@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    // ---- create / update ------------------------------------------------

    /**
     * Customer initiates a payment for one of their orders. Idempotent:
     * a second call for the same order returns the existing active
     * payment rather than failing or duplicating.
     */
    @PostMapping("/pay")
    public ResponseEntity<PaymentResponse> pay(
            HttpServletRequest request,
            @Valid @RequestBody PayRequest req
    ) {
        Long actorId = requireActorId(request);
        Role actorRole = requireActorRole(request);
        PaymentResponse created = paymentService.pay(actorId, actorRole, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * Refund a completed payment. Customer may refund their own;
     * admin may refund any.
     */
    @PostMapping("/{id}/refund")
    public PaymentResponse refund(
            HttpServletRequest request,
            @PathVariable Long id,
            @RequestBody(required = false) @Valid RefundRequest req
    ) {
        Long actorId = requireActorId(request);
        Role actorRole = requireActorRole(request);
        String reason = req == null ? null : req.reason();
        return paymentService.refund(actorId, actorRole, id, reason);
    }

    // ---- read -----------------------------------------------------------

    /** Payments for the calling customer (used by "My Payments" tab). */
    @GetMapping("/mine")
    public List<PaymentResponse> mine(HttpServletRequest request) {
        Long actorId = requireActorId(request);
        Role actorRole = requireActorRole(request);
        return paymentService.listForCustomer(actorId, actorRole);
    }

    /** Payments for the calling seller (used by the seller dashboard tile). */
    @GetMapping("/seller")
    public List<PaymentResponse> sellerPayments(HttpServletRequest request) {
        Long actorId = requireActorId(request);
        Role actorRole = requireActorRole(request);
        return paymentService.listForSeller(actorId, actorRole);
    }

    /** All payments for one order (admin / order detail view). */
    @GetMapping("/order")
    public List<PaymentResponse> byOrder(
            HttpServletRequest request,
            @RequestParam("orderId") Long orderId
    ) {
        Long actorId = requireActorId(request);
        Role actorRole = requireActorRole(request);
        return paymentService.listForOrder(actorId, actorRole, orderId);
    }

    /** Latest payment for one order (order detail view). */
    @GetMapping("/order/latest")
    public ResponseEntity<PaymentResponse> latestForOrder(
            HttpServletRequest request,
            @RequestParam("orderId") Long orderId
    ) {
        Long actorId = requireActorId(request);
        Role actorRole = requireActorRole(request);
        PaymentResponse r = paymentService.latestForOrder(actorId, actorRole, orderId);
        return r == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(r);
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
}
