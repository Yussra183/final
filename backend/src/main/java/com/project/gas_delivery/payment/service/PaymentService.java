package com.project.gas_delivery.payment.service;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.auth.exception.ResourceNotFoundException;
import com.project.gas_delivery.notification.service.NotificationService;
import com.project.gas_delivery.order.entity.OrderEntity;
import com.project.gas_delivery.order.enums.OrderStatus;
import com.project.gas_delivery.order.repository.OrderRepository;
import com.project.gas_delivery.payment.dto.PayRequest;
import com.project.gas_delivery.payment.dto.PaymentResponse;
import com.project.gas_delivery.payment.entity.PaymentEntity;
import com.project.gas_delivery.payment.enums.PaymentMethod;
import com.project.gas_delivery.payment.enums.PaymentStatus;
import com.project.gas_delivery.payment.repository.PaymentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

/**
 * Domain service for the Payment Flow.
 *
 * <p>Mirrors the diagram in the project's flow chart: a customer "Makes
 * Payment to Rider" once the rider has delivered the order. This MVP
 * implements the flow as a simulated gateway — no M-Pesa / Stripe / bank
 * API is called. The {@link #pay} method synthesises a
 * {@code transactionRef} and marks the payment COMPLETED so the
 * customer UI shows a real "Paid" badge with a confirmation code.</p>
 *
 * <p>Lifecycle:
 * <ul>
 *   <li>{@link #pay} — customer initiates a payment for an order. If an
 *       active payment already exists for the order it's returned
 *       (idempotent). New rows start in {@link PaymentStatus#PENDING}
 *       and are flipped to {@link PaymentStatus#COMPLETED} on the same
 *       call (this is the simulation — a real gateway would split the
 *       "initiate" and "confirm" steps).</li>
 *   <li>{@link #markAutoCompletedOnDelivery} — called by the order flow
 *       when a rider marks DELIVERED and the customer chose CASH. Marks
 *       the existing PENDING payment as COMPLETED.</li>
 *   <li>{@link #refund} — flips a COMPLETED payment to REFUNDED. Used
 *       when an order is cancelled / rejected after payment cleared.</li>
 * </ul>
 */
@Service
public class PaymentService {

    private static final SecureRandom RNG = new SecureRandom();

    private final PaymentRepository paymentRepository;
    private final OrderRepository orderRepository;
    private final NotificationService notificationService;

    public PaymentService(PaymentRepository paymentRepository,
                          OrderRepository orderRepository,
                          NotificationService notificationService) {
        this.paymentRepository = paymentRepository;
        this.orderRepository = orderRepository;
        this.notificationService = notificationService;
    }

    // ---- public API -----------------------------------------------------

    /**
     * Customer-initiated payment for one of their orders.
     *
     * <p>Idempotent: if the order already has an active payment
     * (PENDING or COMPLETED) the existing row is returned. This means a
     * customer who double-taps "Pay Now" doesn't create duplicate
     * payments — and the unique index on
     * {@code (order_id) WHERE status IN (PENDING, COMPLETED)} backs the
     * guarantee at the DB level too.</p>
     *
     * <p>For CASH payments we leave the row PENDING and let the
     * DELIVERED transition auto-complete it (the rider collects the
     * cash). For non-CASH we mark it COMPLETED immediately and stamp a
     * transaction ref so the customer sees an "M-Pesa confirmation"
     * badge.</p>
     */
    @Transactional
    public PaymentResponse pay(Long actorId, Role actorRole, PayRequest req) {
        requireRole(actorRole, Role.CUSTOMER);
        Long orderId = parseId(req.orderId(), "orderId");

        OrderEntity order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order " + orderId + " not found."));

        if (!order.getCustomerId().equals(actorId)) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "You can only pay for your own orders.");
        }

        // Reject payment against orders that are no longer eligible.
        // CANCELLED / REJECTED have a refund semantic, not a "pay now"
        // semantic. DELIVERED + PENDING payment means the rider hasn't
        // confirmed cash receipt yet — still pay-able.
        OrderStatus status = order.getStatus();
        if (status == OrderStatus.CANCELLED || status == OrderStatus.REJECTED) {
            throw new BadRequestException(
                    "This order is " + status.toJson() + " and cannot accept a new payment.");
        }

        // Idempotency: return the existing active payment if present.
        var existing = paymentRepository.findActiveByOrderId(orderId);
        if (existing.isPresent()) {
            return PaymentResponse.from(existing.get());
        }

        if (req.method() == PaymentMethod.MPESA
                && (req.phone() == null || req.phone().isBlank())) {
            throw new BadRequestException("Phone number is required for M-Pesa payments.");
        }

        PaymentEntity payment = new PaymentEntity(
                orderId,
                order.getCustomerId(),
                order.getSellerId(),
                order.getTotal() == null ? BigDecimal.ZERO : order.getTotal(),
                req.method()
        );
        payment.setPhone(req.phone());
        payment.setNotes(req.notes());

        if (req.method() == PaymentMethod.CASH) {
            // Stay PENDING — the rider auto-completes on DELIVERED.
            payment.setStatus(PaymentStatus.PENDING);
        } else {
            payment.setStatus(PaymentStatus.COMPLETED);
            payment.setPaidAt(Instant.now());
            payment.setTransactionRef(synthesiseTransactionRef(req.method()));
        }

        PaymentEntity saved = paymentRepository.save(payment);

        // Notify seller so the dashboard reflects a paid order.
        notificationService.notify(
                order.getSellerId(),
                "payment",
                "Payment received",
                "Customer paid " + saved.getAmount().toPlainString()
                        + " via " + saved.getMethod().toJson()
                        + " for order #" + orderId + ".",
                "{\"orderId\":" + orderId + ",\"paymentId\":" + saved.getId() + "}"
        );

        return PaymentResponse.from(saved);
    }

    /**
     * Called by the order flow when an order transitions to DELIVERED.
     * Auto-completes any PENDING payment for the order (typically the
     * CASH payment the rider collected on delivery).
     *
     * <p>No-op if the order has no active payment — the customer may
     * have chosen M-Pesa and already paid earlier. No-op if the active
     * payment is already COMPLETED.</p>
     */
    @Transactional
    public void markAutoCompletedOnDelivery(Long orderId) {
        var existing = paymentRepository.findActiveByOrderId(orderId);
        if (existing.isEmpty()) {
            return;
        }
        PaymentEntity p = existing.get();
        if (p.getStatus() == PaymentStatus.COMPLETED) {
            return;
        }
        p.setStatus(PaymentStatus.COMPLETED);
        p.setPaidAt(Instant.now());
        if (p.getTransactionRef() == null || p.getTransactionRef().isBlank()) {
            p.setTransactionRef(synthesiseTransactionRef(p.getMethod()));
        }
        PaymentEntity saved = paymentRepository.save(p);

        notificationService.notify(
                saved.getCustomerId(),
                "payment",
                "Payment completed",
                "Your payment of " + saved.getAmount().toPlainString()
                        + " for order #" + orderId + " has been received.",
                "{\"orderId\":" + orderId + ",\"paymentId\":" + saved.getId() + "}"
        );
    }

    /**
     * Refund a completed payment. Used when an order is cancelled or
     * rejected after the payment has cleared. Idempotent — refunding an
     * already-refunded payment is a no-op so retried hooks don't blow
     * up.
     */
    @Transactional
    public PaymentResponse refund(Long actorId, Role actorRole, Long paymentId, String reason) {
        // Authorisation rules:
        //   ADMIN can refund any payment.
        //   CUSTOMER can refund their own payment (typically after a
        //   self-cancel).
        //   SELLER is NOT allowed here — refunds are driven by the
        //   system when an order is rejected / cancelled, not by the
        //   seller clicking a button. (The seller rejection hook in
        //   OrderServiceImpl calls this internally with admin rights.)
        PaymentEntity payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResourceNotFoundException("Payment " + paymentId + " not found."));

        if (actorRole == Role.CUSTOMER && !payment.getCustomerId().equals(actorId)) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "You can only refund your own payments.");
        }
        if (actorRole != Role.ADMIN && actorRole != Role.CUSTOMER) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "Only the customer or an admin can refund a payment.");
        }

        if (payment.getStatus() == PaymentStatus.REFUNDED) {
            return PaymentResponse.from(payment);
        }
        if (payment.getStatus() != PaymentStatus.COMPLETED) {
            throw new BadRequestException(
                    "Only COMPLETED payments can be refunded (current: "
                            + payment.getStatus().toJson() + ").");
        }

        payment.setStatus(PaymentStatus.REFUNDED);
        payment.setRefundedAt(Instant.now());
        if (reason != null && !reason.isBlank()) {
            String existing = payment.getNotes();
            payment.setNotes(existing == null
                    ? "Refunded: " + reason
                    : existing + "\nRefunded: " + reason);
        }
        PaymentEntity saved = paymentRepository.save(payment);

        notificationService.notify(
                saved.getCustomerId(),
                "payment",
                "Payment refunded",
                "Your payment of " + saved.getAmount().toPlainString()
                        + " for order #" + saved.getOrderId() + " has been refunded.",
                "{\"orderId\":" + saved.getOrderId() + ",\"paymentId\":" + saved.getId() + "}"
        );

        return PaymentResponse.from(saved);
    }

    /**
     * Auto-refund the active payment for an order. Used by the order
     * flow when a customer cancels or a seller rejects after payment
     * cleared. System-level — bypasses the customer-only auth check.
     *
     * <p>Notifies the customer so the refund doesn't go unnoticed
     * (closes the gap left by the silent refund that originally only
     * flipped the row in the DB). Sells notifications are routed via
     * NotificationService so the customer sees the refund in their
     * notifications drawer, not just the payment history.</p>
     */
    @Transactional
    public void autoRefundForOrder(Long orderId, String reason) {
        var existing = paymentRepository.findActiveByOrderId(orderId);
        if (existing.isEmpty()) {
            return;
        }
        PaymentEntity p = existing.get();
        if (p.getStatus() != PaymentStatus.COMPLETED) {
            return;
        }
        p.setStatus(PaymentStatus.REFUNDED);
        p.setRefundedAt(Instant.now());
        if (reason != null && !reason.isBlank()) {
            String existing2 = p.getNotes();
            p.setNotes(existing2 == null
                    ? "Refunded: " + reason
                    : existing2 + "\nRefunded: " + reason);
        }
        PaymentEntity saved = paymentRepository.save(p);

        // So the customer doesn't have to discover the refund by
        // reloading the Payments tab — mirror the manual `refund()`
        // notification here.
        notificationService.notify(
                saved.getCustomerId(),
                "payment",
                "Payment refunded",
                "Your payment of " + saved.getAmount().toPlainString()
                        + " for order #" + orderId + " has been refunded.",
                "{\"orderId\":" + orderId + ",\"paymentId\":" + saved.getId() + "}"
        );
    }

    // ---- read surface ---------------------------------------------------

    /** List payments for the calling customer, newest first. */
    @Transactional(readOnly = true)
    public List<PaymentResponse> listForCustomer(Long actorId, Role actorRole) {
        requireRole(actorRole, Role.CUSTOMER);
        return paymentRepository.findByCustomerIdOrderByUpdatedAtDesc(actorId)
                .stream()
                .map(PaymentResponse::from)
                .toList();
    }

    /** List payments for the calling seller, newest first. */
    @Transactional(readOnly = true)
    public List<PaymentResponse> listForSeller(Long actorId, Role actorRole) {
        requireRole(actorRole, Role.SELLER);
        return paymentRepository.findBySellerIdOrderByUpdatedAtDesc(actorId)
                .stream()
                .map(PaymentResponse::from)
                .toList();
    }

    /**
     * List payments for an order, newest first.
     *
     * <p>Authorisation: ADMIN can read any order; CUSTOMER must own the
     * order; SELLER must be the order's seller. Without this guard, any
     * authenticated caller could read another customer's payment
     * history by passing an arbitrary orderId.</p>
     */
    @Transactional(readOnly = true)
    public List<PaymentResponse> listForOrder(Long actorId, Role actorRole, Long orderId) {
        requireOrderAccess(actorId, actorRole, orderId);
        return paymentRepository.findAll().stream()
                .filter(p -> p.getOrderId().equals(orderId))
                .sorted((a, b) -> b.getUpdatedAt().compareTo(a.getUpdatedAt()))
                .map(PaymentResponse::from)
                .toList();
    }

    /**
     * Latest payment for an order (used by the order detail view).
     *
     * <p>Same authorisation guard as {@link #listForOrder}.</p>
     */
    @Transactional(readOnly = true)
    public PaymentResponse latestForOrder(Long actorId, Role actorRole, Long orderId) {
        requireOrderAccess(actorId, actorRole, orderId);
        return paymentRepository.findFirstByOrderIdOrderByUpdatedAtDesc(orderId)
                .map(PaymentResponse::from)
                .orElse(null);
    }

    /**
     * Verify the caller is allowed to read payment data for an order.
     * Throws {@link com.project.gas_delivery.order.exception.NotAuthorizedException}
     * if not. Admin is unrestricted; customer must own the order;
     * seller must be the order's seller; everyone else is rejected.
     */
    private void requireOrderAccess(Long actorId, Role actorRole, Long orderId) {
        if (actorRole == Role.ADMIN) {
            return;
        }
        OrderEntity order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order " + orderId + " not found."));
        if (actorRole == Role.CUSTOMER && order.getCustomerId().equals(actorId)) {
            return;
        }
        if (actorRole == Role.SELLER && order.getSellerId().equals(actorId)) {
            return;
        }
        throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                "You are not allowed to read payments for this order.");
    }

    // ---- helpers --------------------------------------------------------

    private void requireRole(Role actual, Role expected) {
        if (actual != expected) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "This action requires the " + expected.name().toLowerCase() + " role.");
        }
    }

    private static Long parseId(String raw, String fieldName) {
        if (raw == null || raw.isBlank()) {
            throw new BadRequestException(fieldName + " is required.");
        }
        try {
            return Long.parseLong(raw.trim());
        } catch (NumberFormatException e) {
            throw new BadRequestException(fieldName + " must be a numeric id.");
        }
    }

    /**
     * Synthesise a transaction reference that mimics what an M-Pesa /
     * Stripe / bank confirmation would emit. Format:
     * {@code TXN-<METHOD>-<6 hex chars>}. The hex chars are random so
     * each call produces a unique reference.
     */
    private static String synthesiseTransactionRef(PaymentMethod method) {
        byte[] buf = new byte[3];
        RNG.nextBytes(buf);
        StringBuilder hex = new StringBuilder();
        for (byte b : buf) {
            hex.append(String.format(Locale.ROOT, "%02X", b));
        }
        return "TXN-" + method.name() + "-" + hex;
    }
}
