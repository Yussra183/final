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
import com.project.gas_delivery.notification.service.NotificationService;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.repository.RiderApplicationRepository;
import com.project.gas_delivery.payment.service.PaymentService;
import com.project.gas_delivery.product.GasCatalog;
import com.project.gas_delivery.product.entity.ProductEntity;
import com.project.gas_delivery.product.repository.ProductRepository;
import com.project.gas_delivery.product.service.StockService;
import com.project.gas_delivery.rider.entity.RiderProfileEntity;
import com.project.gas_delivery.rider.repository.RiderProfileRepository;
import com.project.gas_delivery.rider.repository.SellerRiderRepository;
import com.project.gas_delivery.tracking.service.DeliveryTrackingService;
import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

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

    private static final Logger log = LoggerFactory.getLogger(OrderServiceImpl.class);

    private final OrderRepository orderRepository;
    private final UserRepository userRepository;
    private final SellerRiderRepository sellerRiderRepository;
    private final RiderProfileRepository riderProfileRepository;
    private final RiderApplicationRepository riderApplicationRepository;
    private final DeliveryTrackingService deliveryTrackingService;
    private final StockService stockService;
    private final ProductRepository productRepository;
    private final NotificationService notificationService;
    private final PaymentService paymentService;
    private final EntityManager entityManager;

    public OrderServiceImpl(OrderRepository orderRepository,
                            UserRepository userRepository,
                            SellerRiderRepository sellerRiderRepository,
                            RiderProfileRepository riderProfileRepository,
                            RiderApplicationRepository riderApplicationRepository,
                            DeliveryTrackingService deliveryTrackingService,
                            StockService stockService,
                            ProductRepository productRepository,
                            NotificationService notificationService,
                            PaymentService paymentService,
                            EntityManager entityManager) {
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
        this.sellerRiderRepository = sellerRiderRepository;
        this.riderProfileRepository = riderProfileRepository;
        this.riderApplicationRepository = riderApplicationRepository;
        this.deliveryTrackingService = deliveryTrackingService;
        this.stockService = stockService;
        this.productRepository = productRepository;
        this.notificationService = notificationService;
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
        log.info("[ORDER_DEBUG][CREATE] customerId={} sellerId={} itemCount={}",
                customerId, sellerId, req.items().size());

        for (var item : req.items()) {
            Long productId = parseId(item.productId(), "item.productId");
            ProductEntity product = productRepository.findById(productId)
                    .orElseThrow(() -> new BadRequestException("Selected product was not found."));
            if (!product.isActive()) {
                throw new BadRequestException("Selected product is no longer available.");
            }
            if (!sellerId.equals(product.getSellerId())) {
                throw new BadRequestException("Selected product does not belong to the chosen seller.");
            }
            if (!GasCatalog.isSupportedBrand(item.productName())) {
                throw new BadRequestException("Selected gas brand is not supported.");
            }
            if (!GasCatalog.isSupportedSize(item.productName(), item.size())) {
                throw new BadRequestException(item.productName() + " does not support " + item.size() + ".");
            }
            if (!product.getName().equals(item.productName()) || !product.getSize().equals(item.size())) {
                throw new BadRequestException(
                        "Selected gas brand or cylinder size no longer matches this seller's inventory.");
            }
            log.info("[ORDER_DEBUG][CREATE] customerId={} sellerId={} gasBrand={} cylinderSize={} quantity={}",
                    customerId, sellerId, item.productName(), item.size(), item.quantity());
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
        log.info("[ORDER_LIFECYCLE][CREATED] orderId={} customerId={} sellerId={} status={} riderId={}",
                saved.getId(), saved.getCustomerId(), saved.getSellerId(),
                saved.getStatus(), saved.getRiderId());
        var firstItem = saved.getItems().isEmpty() ? null : saved.getItems().get(0);
        if (firstItem != null) {
            String data = "{" +
                    "\"orderId\":\"" + saved.getId() + "\"," +
                    "\"sellerId\":\"" + saved.getSellerId() + "\"," +
                    "\"gasBrand\":\"" + jsonEscape(firstItem.productName()) + "\"," +
                    "\"cylinderSize\":\"" + jsonEscape(firstItem.size()) + "\"," +
                    "\"quantity\":" + firstItem.quantity() + "," +
                    "\"deliveryType\":\"Delivery\"" +
                    "}";
            notificationService.notify(
                    saved.getSellerId(),
                    "order",
                    "New Gas Order",
                    "Order #" + saved.getId() + " • " + firstItem.productName()
                            + " • " + firstItem.size() + " x " + firstItem.quantity()
                            + " • Delivery",
                    data
            );
            log.info("[ORDER_DEBUG][SELLER_NOTIFICATION] sellerId={} orderId={} notificationCreated={}",
                    saved.getSellerId(), saved.getId(), true);
        }
        return OrderResponse.from(saved);
    }

    // ---- seller decisions ----------------------------------------------

    @Override
    @Transactional
    public OrderResponse accept(Long actorId, Role actorRole, Long orderId) {
        requireRole(actorRole, Role.SELLER);
        OrderEntity order = loadOrder(orderId);
        OrderStatus previousStatus = order.getStatus();
        requireOwnership(order, actorId, ActorRole.SELLER, OrderStatus.ACCEPTED);
        OrderResponse response = setStatus(order, OrderStatus.ACCEPTED);
        log.info("[ORDER_LIFECYCLE][SELLER_ACCEPTED] orderId={} sellerId={} oldStatus={} newStatus={} riderId={}",
                order.getId(), order.getSellerId(), previousStatus, order.getStatus(), order.getRiderId());
        notifyReadyForPickup(order);
        return response;
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
        User rider = userRepository.findById(riderId)
                .orElseThrow(() -> new BadRequestException("Rider not found."));
        requireApprovedRider(riderId);
        RiderProfileEntity riderProfile = riderProfileRepository.findById(riderId)
                .orElseGet(() -> riderProfileRepository.save(new RiderProfileEntity(
                        riderId,
                        "motorcycle",
                        null,
                        null,
                        null,
                        true,
                        rider.getPhone(),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null
                )));
        if (!riderProfile.isAvailable()) {
            throw new NotAuthorizedException("You are currently busy and cannot accept a new delivery.");
        }

        OrderEntity order = orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException("Order " + orderId + " not found."));

        if (order.getStatus() != OrderStatus.ACCEPTED) {
            throw new InvalidTransitionException(
                    "Order is " + order.getStatus().toJson() + "; only ACCEPTED orders can be claimed.");
        }
        if (order.getRiderId() != null) {
            throw new RiderBusyException("Order is no longer available.");
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
            throw new RiderBusyException("Order is no longer available.");
        }

        riderProfile.setAvailable(false);
        riderProfileRepository.save(riderProfile);

        entityManager.flush();
        entityManager.clear();

        OrderEntity claimed = loadOrder(orderId);
        notifyClaimedOrder(claimed);
        return OrderResponse.from(claimed);
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
                yield orderRepository.findByRiderIdOrderByUpdatedAtDesc(actorFilterId);
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
        long acceptedTotal = orderRepository.countByStatus(OrderStatus.ACCEPTED);
        long acceptedUnassigned = orderRepository.countByStatusAndRiderIdIsNull(OrderStatus.ACCEPTED);
        long acceptedAssigned = orderRepository.countByStatusAndRiderIdIsNotNull(OrderStatus.ACCEPTED);

        if (actorId == null || actorRole != Role.RIDER) {
            log.info("[RIDER_ORDERS] actorRole={} actorId={} acceptedTotal={} acceptedUnassigned={} acceptedAssigned={} returnedOrderIds={}",
                    actorRole, actorId, acceptedTotal, acceptedUnassigned, acceptedAssigned,
                    all.stream().map(OrderEntity::getId).toList());
            return all.stream().map(OrderResponse::from).toList();
        }
        requireApprovedRider(actorId);
        RiderProfileEntity riderProfile = riderProfileRepository.findById(actorId).orElse(null);
        if (riderProfile != null && !riderProfile.isAvailable()) {
            log.info("[RIDER_ORDERS] riderId={} available=false acceptedTotal={} acceptedUnassigned={} acceptedAssigned={} returnedOrderIds=[]",
                    actorId, acceptedTotal, acceptedUnassigned, acceptedAssigned);
            return List.of();
        }
        log.info("[RIDER_ORDERS] riderId={} available={} acceptedTotal={} acceptedUnassigned={} acceptedAssigned={} returnedOrderIds={}",
                actorId,
                riderProfile == null ? null : riderProfile.isAvailable(),
                acceptedTotal,
                acceptedUnassigned,
                acceptedAssigned,
                all.stream().map(OrderEntity::getId).toList());
        return all.stream().map(OrderResponse::from).toList();
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
            if (saved.getRiderId() != null) {
                riderProfileRepository.findById(saved.getRiderId()).ifPresent(profile -> {
                    profile.setAvailable(true);
                    riderProfileRepository.save(profile);
                });
            }
        }
        return OrderResponse.from(saved);
    }

    private void requireApprovedRider(Long riderId) {
        boolean approved = riderApplicationRepository.findByRiderId(riderId)
                .map(application -> application.getStatus() == PermitStatus.APPROVED)
                .orElse(false);
        if (!approved) {
            throw new NotAuthorizedException("Only approved riders can accept deliveries.");
        }
    }

    private void notifyReadyForPickup(OrderEntity order) {
        notificationService.notify(
                order.getCustomerId(),
                "order",
                "Order accepted",
                order.getSellerName() + " accepted order #" + order.getId() + ". It is now ready for pickup.",
                "{\"orderId\":\"" + order.getId() + "\"}"
        );

        Set<Long> approvedRiderIds = new HashSet<>(
                riderApplicationRepository.findRiderIdsByStatus(PermitStatus.APPROVED));
        if (approvedRiderIds.isEmpty()) {
            return;
        }
        List<RiderProfileEntity> availableRiders = riderProfileRepository.findByAvailable(true);
        if (availableRiders.isEmpty()) {
            return;
        }
        String data = buildRiderNotificationData(order);
        for (RiderProfileEntity rider : availableRiders) {
            if (!approvedRiderIds.contains(rider.getUserId())) {
                continue;
            }
            notificationService.notify(
                    rider.getUserId(),
                    "delivery",
                    "New delivery available",
                    order.getSellerName() + " • " + firstItemSummary(order),
                    data
            );
        }
    }

    private void notifyClaimedOrder(OrderEntity order) {
        if (order.getRiderId() == null) {
            return;
        }
        String riderName = order.getRiderName() == null || order.getRiderName().isBlank()
                ? "A rider"
                : order.getRiderName();
        String data = "{" +
                "\"orderId\":\"" + order.getId() + "\"," +
                "\"riderId\":\"" + order.getRiderId() + "\"," +
                "\"sellerId\":\"" + order.getSellerId() + "\"" +
                "}";
        notificationService.notify(
                order.getCustomerId(),
                "delivery",
                "Rider assigned",
                riderName + " accepted order #" + order.getId() + " and is heading to "
                        + order.getSellerName() + ".",
                data
        );
        notificationService.notify(
                order.getSellerId(),
                "delivery",
                "Rider assigned",
                riderName + " accepted order #" + order.getId() + ". Prepare pickup for dispatch.",
                data
        );
    }

    private String buildRiderNotificationData(OrderEntity order) {
        var firstItem = order.getItems().isEmpty() ? null : order.getItems().get(0);
        return "{" +
                "\"orderId\":\"" + order.getId() + "\"," +
                "\"sellerId\":\"" + order.getSellerId() + "\"," +
                "\"sellerName\":\"" + jsonEscape(order.getSellerName()) + "\"," +
                "\"gasBrand\":\"" + jsonEscape(firstItem == null ? "" : firstItem.productName()) + "\"," +
                "\"gasSize\":\"" + jsonEscape(firstItem == null ? "" : firstItem.size()) + "\"," +
                "\"quantity\":" + (firstItem == null ? 0 : firstItem.quantity()) +
                "}";
    }

    private String firstItemSummary(OrderEntity order) {
        var firstItem = order.getItems().isEmpty() ? null : order.getItems().get(0);
        if (firstItem == null) {
            return "New order ready for pickup";
        }
        return firstItem.productName() + " " + firstItem.size() + " x " + firstItem.quantity();
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

    private static String jsonEscape(String input) {
        if (input == null) return "";
        return input
                .replace("\\", "\\\\")
                .replace("\"", "\\\"");
    }

    private List<OrderEntity> allOrdersSorted() {
        return orderRepository.findAll().stream()
                .sorted((a, b) -> b.getUpdatedAt().compareTo(a.getUpdatedAt()))
                .toList();
    }
}
