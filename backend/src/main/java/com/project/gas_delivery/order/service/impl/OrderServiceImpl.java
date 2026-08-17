package com.project.gas_delivery.order.service.impl;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.order.dto.CreateOrderRequest;
import com.project.gas_delivery.order.dto.OrderResponse;
import com.project.gas_delivery.order.entity.OrderEntity;
import com.project.gas_delivery.order.enums.OrderStatus;
import com.project.gas_delivery.order.exception.InvalidTransitionException;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.order.exception.OrderNotFoundException;
import com.project.gas_delivery.order.exception.RiderBusyException;
import com.project.gas_delivery.order.repository.OrderRepository;
import com.project.gas_delivery.order.service.OrderService;
import com.project.gas_delivery.order.service.OrderStatusTransitions;
import com.project.gas_delivery.order.service.OrderStatusTransitions.ActorRole;
import com.project.gas_delivery.payment.service.PaymentService;
import com.project.gas_delivery.product.service.StockService;
import com.project.gas_delivery.rider.repository.SellerRiderRepository;
import com.project.gas_delivery.tracking.service.DeliveryTrackingService;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Default implementation of {@link OrderService}.
 *
 * <p>Mirrors the frontend's {@code OrderService} in
 * {@code src/services/OrderService.ts} — same state machine, same
 * ownership rules, same role guards. The frontend stays as defence-in-depth;
 * the server is authoritative.</p>
 *
 * <p>{@link #claim(Long, Role, Long, Long, String)} uses a native atomic
 * UPDATE…RETURNING so two concurrent riders can't both succeed.</p>
 */
@Service
public class OrderServiceImpl implements OrderService {

    private final OrderRepository orderRepository;
    private final UserRepository userRepository;
    private final SellerRiderRepository sellerRiderRepository;
    private final DeliveryTrackingService deliveryTrackingService;
    private final StockService stockService;
    private final PaymentService paymentService;
    private final EntityManager entityManager;

    public OrderServiceImpl(OrderRepository orderRepository,
                            UserRepository userRepository,
                            SellerRiderRepository sellerRiderRepository,
                            DeliveryTrackingService deliveryTrackingService,
                            StockService stockService,
                            PaymentService paymentService,
                            EntityManager entityManager) {
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
        this.sellerRiderRepository = sellerRiderRepository;
        this.deliveryTrackingService = deliveryTrackingService;
        this.stockService = stockService;
        this.paymentService = paymentService;
        this.entityManager = entityManager;
    }

    // ---- create ---------------------------------------------------------

    @Override
    @Transactional
    public OrderResponse create(Long actorId, Role actorRole, CreateOrderRequest req) {
        if (actorRole != Role.CUSTOMER) {
            throw new NotAuthorizedException("Only customers can create orders.");
        }
        Long customerId = parseId(req.customerId(), "customerId");
        if (!customerId.equals(actorId)) {
            throw new NotAuthorizedException("You can only create orders for yourself.");
        }
        Long sellerId = parseId(req.sellerId(), "sellerId");
        User seller = userRepository.findById(sellerId)
                .orElseThrow(() -> new BadRequestException("Seller not found."));
        // Permit gating: only active sellers (admin-approved) can receive
        // orders. Newly-registered sellers start with is_active=false; the
        // flag flips to true when an admin approves their permit.
        if (seller.getRole() != Role.SELLER || !seller.isActive()) {
            throw new NotAuthorizedException(
                    "This seller is not yet approved to accept orders.");
        }

        // ---- FR-05 stock reservation -----------------------------------
        // Decrement each line item's stock atomically BEFORE we save the
        // order. StockService.reserveForOrder runs in this same
        // transaction (Propagation.MANDATORY); if any item fails
        // (insufficient stock, inactive product), it throws
        // InsufficientStockException and Spring rolls back the entire
        // create(...) call, leaving the database untouched — no order
        // row, no partial stock decrement.
        //
        // We process items in two passes:
        //   1. validate every item's productId parses cleanly,
        //   2. reserve stock per item.
        // Items are already @NotEmpty + @Valid in CreateOrderRequest,
        // so the list is non-null and each item's quantity is >= 1.
        for (var item : req.items()) {
            Long productId = parseId(item.productId(), "item.productId");
            // Defensive: items with quantity <= 0 should already have
            // failed bean validation, but the StockService double-checks
            // and would throw IllegalArgumentException. Convert it to
            // a friendly BadRequestException so the customer UI sees a
            // consistent 400.
            try {
                stockService.reserveForOrder(productId, item.quantity());
            } catch (IllegalArgumentException ex) {
                throw new BadRequestException(ex.getMessage());
            }
        }

        OrderEntity entity = new OrderEntity(
                customerId,
                req.customerName(),
                sellerId,
                req.sellerName(),
                req.items().stream().map(i -> i.toEmbeddable()).toList(),
                req.total() == null ? BigDecimal.ZERO : req.total(),
                req.deliveryLocation().address()
        );
        entity.setDeliveryLat(req.deliveryLocation().lat());
        entity.setDeliveryLng(req.deliveryLocation().lng());
        entity.setPhone(req.phone());
        entity.setNotes(req.notes());

        OrderEntity saved = orderRepository.save(entity);
        return OrderResponse.from(saved);
    }

    // ---- seller decisions ----------------------------------------------

    @Override
    @Transactional
    public OrderResponse accept(Long actorId, Role actorRole, Long orderId) {
        requireRole(actorRole, Role.SELLER);
        OrderEntity order = loadOrder(orderId);
        requireOwnership(order, actorId, ActorRole.SELLER, OrderStatus.ACCEPTED);
        return setStatus(order, OrderStatus.ACCEPTED);
    }

    @Override
    @Transactional
    public OrderResponse reject(Long actorId, Role actorRole, Long orderId, String reason) {
        requireRole(actorRole, Role.SELLER);
        OrderEntity order = loadOrder(orderId);
        requireOwnership(order, actorId, ActorRole.SELLER, OrderStatus.REJECTED);
        order.setRejectReason(reason);
        OrderResponse response = setStatus(order, OrderStatus.REJECTED);
        // If the customer had already paid, refund the active payment so
        // they see a REFUNDED row in their payment history.
        paymentService.autoRefundForOrder(orderId, "Seller rejected the order" + (reason == null ? "." : ": " + reason));
        return response;
    }

    // ---- customer cancel -----------------------------------------------

    @Override
    @Transactional
    public OrderResponse cancel(Long actorId, Role actorRole, Long orderId, String reason) {
        requireRole(actorRole, Role.CUSTOMER);
        OrderEntity order = loadOrder(orderId);
        requireOwnership(order, actorId, ActorRole.CUSTOMER, OrderStatus.CANCELLED);
        order.setRejectReason(reason);
        OrderResponse response = setStatus(order, OrderStatus.CANCELLED);
        // Same refund semantic as seller rejection — any captured payment
        // is reversed.
        paymentService.autoRefundForOrder(orderId, "Customer cancelled the order" + (reason == null ? "." : ": " + reason));
        return response;
    }

    // ---- rider claim ----------------------------------------------------

    @Override
    @Transactional
    public OrderResponse claim(Long actorId, Role actorRole, Long orderId, Long riderId, String riderName) {
        requireRole(actorRole, Role.RIDER);
        if (!riderId.equals(actorId)) {
            throw new NotAuthorizedException("You can only claim orders for yourself.");
        }
        if (!userRepository.existsById(riderId)) {
            throw new BadRequestException("Rider not found.");
        }

        // ---- Seller-assignment guard (added 2026-07-21) -------------
        // A rider can only claim orders from sellers they're assigned to
        // via the `seller_riders` join table. We do this pre-flight as a
        // hard 403 BEFORE the atomic UPDATE so any cross-seller attempt is
        // rejected with a clear reason instead of racing into `ASSIGNED`.
        OrderEntity order = orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException("Order " + orderId + " not found."));

        if (order.getStatus() != OrderStatus.ACCEPTED) {
            throw new InvalidTransitionException(
                    "Order is " + order.getStatus().toJson() + "; only ACCEPTED orders can be claimed.");
        }
        if (order.getRiderId() != null) {
            // Already taken — surface as a race loss; the JOIN check would
            // be moot against an order that's already ASSIGNED.
            throw new RiderBusyException("Another rider has already accepted this delivery.");
        }
        if (!sellerRiderRepository.existsBySellerIdAndRiderId(order.getSellerId(), riderId)) {
            throw new NotAuthorizedException(
                    "This rider is not assigned to the order's seller.");
        }

        // Atomic UPDATE … RETURNING — first rider wins.
        //
        // We rely on the row count (RETURNING gives the same thing as
        // a SELECT) and re-load the entity through JPA afterwards so the
        // response is consistent with what subsequent reads will see,
        // avoiding any RETURNING-column ordering shenanigans with native
        // results.
        @SuppressWarnings("unchecked")
        List<Object> rows = entityManager.createNativeQuery("""
                UPDATE orders
                   SET rider_id   = :riderId,
                       rider_name = :riderName,
                       status     = 'ASSIGNED',
                       updated_at = CURRENT_TIMESTAMP
                 WHERE id = :id
                   AND rider_id IS NULL
                   AND status = 'ACCEPTED'
                RETURNING id
                """)
                .setParameter("riderId", riderId)
                .setParameter("riderName", riderName)
                .setParameter("id", orderId)
                .getResultList();

        if (rows.isEmpty()) {
            // 0 rows updated → another rider raced ahead between the
            // pre-flight check and the UPDATE (the JOIN already proved
            // membership, so it's purely a race on `rider_id IS NULL`).
            throw new RiderBusyException("Another rider has already accepted this delivery.");
        }

        // Detach any cached entity and re-load so the response reflects
        // the post-UPDATE state we just persisted (avoids RETURNING
        // column-order mismatches with Hibernate's entity mapping).
        entityManager.flush();
        entityManager.clear();
        return OrderResponse.from(loadOrder(orderId));
    }

    // ---- rider progress -------------------------------------------------

    @Override
    @Transactional
    public OrderResponse advance(Long actorId, Role actorRole, Long orderId, OrderStatus next, String note) {
        requireRole(actorRole, Role.RIDER);
        OrderEntity order = loadOrder(orderId);

        // The rider must be the assignee for any post-claim transition.
        // We allow null riderId during the claim race (atomic UPDATE handles
        // it before this method is called) but for advance, riderId must
        // already be set and match the actor.
        if (order.getRiderId() == null || !order.getRiderId().equals(actorId)) {
            throw new NotAuthorizedException("You can only update deliveries assigned to you.");
        }
        requireOwnership(order, actorId, ActorRole.RIDER, next);
        return setStatus(order, next);
    }

    // ---- queries --------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public List<OrderResponse> list(Long actorId, Role actorRole,
                                    String customerId, String sellerId, String riderId) {
        // Force role-based filter so a user can't read someone else's orders.
        // Admin/supplier are intentionally unrestricted (read-only in the
        // MVP — the controllers in their respective screens do their own
        // filtering for write paths).
        Long actorFilterId = actorId;

        List<OrderEntity> rows = switch (actorRole) {
            case CUSTOMER -> orderRepository.findByCustomerIdOrderByUpdatedAtDesc(actorFilterId);
            case SELLER -> orderRepository.findBySellerIdOrderByUpdatedAtDesc(actorFilterId);
            case RIDER -> {
                // A rider sees every order belonging to any seller
                // they're assigned to via `seller_riders` — unclaimed
                // (ACCEPTED, rider_id IS NULL) AND in-flight, NOT only
                // orders they've already self-claimed. The seller-set
                // lookup is the same guard `claim(...)` already
                // enforces, so riders never see orders from sellers
                // they're not assigned to.
                Set<Long> assignedSellerIds = sellerRiderRepository
                        .findSellerIdsByRiderId(actorFilterId)
                        .stream()
                        .collect(Collectors.toSet());
                if (assignedSellerIds.isEmpty()) {
                    yield List.of();
                }
                yield orderRepository
                        .findBySellerIdInOrderByUpdatedAtDesc(assignedSellerIds);
            }
            case ADMIN, SUPPLIER -> allOrdersSorted();
        };

        // Optional extra filters (admin / supplier use case).
        if (customerId != null && !customerId.isBlank()) {
            Long cid = parseId(customerId, "customerId");
            rows = rows.stream().filter(o -> cid.equals(o.getCustomerId())).toList();
        }
        if (sellerId != null && !sellerId.isBlank()) {
            Long sid = parseId(sellerId, "sellerId");
            rows = rows.stream().filter(o -> sid.equals(o.getSellerId())).toList();
        }
        if (riderId != null && !riderId.isBlank()) {
            Long rid = parseId(riderId, "riderId");
            rows = rows.stream().filter(o -> rid.equals(o.getRiderId())).toList();
        }

        return rows.stream().map(OrderResponse::from).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrderResponse> availableForRiders(Long actorId, Role actorRole) {
        List<OrderEntity> all = orderRepository.findAvailableForDispatch();

        // For riders, narrow the queue to orders from sellers they're assigned
        // to via the seller_riders table. Admin/supplier see the global queue.
        if (actorId == null || actorRole != Role.RIDER) {
            return all.stream().map(OrderResponse::from).toList();
        }

        Set<Long> assignedSellerIds = sellerRiderRepository.findSellerIdsByRiderId(actorId).stream()
                .collect(Collectors.toSet());

        if (assignedSellerIds.isEmpty()) {
            // Rider isn't assigned to any seller — empty queue is correct.
            return List.of();
        }

        return all.stream()
                .filter(o -> assignedSellerIds.contains(o.getSellerId()))
                .map(OrderResponse::from)
                .toList();
    }

    // ---- helpers --------------------------------------------------------

    private OrderEntity loadOrder(Long orderId) {
        return orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException("Order " + orderId + " not found."));
    }

    private void requireRole(Role actual, Role expected) {
        if (actual != expected) {
            throw new NotAuthorizedException(
                    "This action requires the " + expected.name().toLowerCase() + " role.");
        }
    }

    private void requireOwnership(OrderEntity order, Long actorId, ActorRole role, OrderStatus target) {
        if (OrderStatusTransitions.isTerminal(order.getStatus())) {
            throw new InvalidTransitionException(
                    "Order is " + order.getStatus().toJson() + " (terminal); no further transitions are allowed.");
        }
        if (!OrderStatusTransitions.isAllowed(role, order.getStatus(), target)) {
            throw new InvalidTransitionException(
                    "Cannot transition order from " + order.getStatus().toJson()
                            + " to " + target.toJson() + " as " + role.name().toLowerCase() + ".");
        }
        switch (role) {
            case CUSTOMER -> {
                if (!actorId.equals(order.getCustomerId())) {
                    throw new NotAuthorizedException("You can only act on your own orders.");
                }
            }
            case SELLER -> {
                if (!actorId.equals(order.getSellerId())) {
                    throw new NotAuthorizedException("You can only act on orders assigned to your shop.");
                }
            }
            case RIDER -> {
                // claim is handled by the atomic UPDATE path; for everything
                // past claim we check riderId != null above.
                if (order.getRiderId() != null && !actorId.equals(order.getRiderId())) {
                    throw new NotAuthorizedException("You can only update deliveries assigned to you.");
                }
            }
        }
    }

    private OrderResponse setStatus(OrderEntity order, OrderStatus next) {
        order.setStatus(next);
        OrderEntity saved = orderRepository.save(order);
        // Tear down the tracking cache once the order is terminal so the
        // rider's GPS samples are ignored and no further broadcasts fan
        // out to customer/seller subscribers.
        if (OrderStatusTransitions.isTerminal(next)) {
            deliveryTrackingService.clearOnDelivery(saved.getId());
            // When the rider marks the order DELIVERED, auto-complete
            // any pending payment (typically the CASH payment the rider
            // collected on delivery). Other terminal states (CANCELLED,
            // REJECTED) are handled at the call site by the
            // `autoRefundForOrder` hook so we can pass a reason.
            if (next == OrderStatus.DELIVERED) {
                paymentService.markAutoCompletedOnDelivery(saved.getId());
            }
        }
        return OrderResponse.from(saved);
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

    private List<OrderEntity> allOrdersSorted() {
        return orderRepository.findAll().stream()
                .sorted((a, b) -> b.getUpdatedAt().compareTo(a.getUpdatedAt()))
                .toList();
    }
}
