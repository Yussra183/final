package com.project.gas_delivery.order.service;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.order.dto.CreateOrderRequest;
import com.project.gas_delivery.order.dto.OrderResponse;
import com.project.gas_delivery.order.enums.OrderStatus;

import java.util.List;

/**
 * Domain service for the Order Flow.
 *
 * <p>The actor identity arrives as {@code actorId} (Long) and
 * {@code actorRole} (Role) — typically resolved from the request's
 * bearer-token attributes by the controller layer.</p>
 *
 * <p>Every public method enforces:
 * <ul>
 *   <li>Role-based ownership: only the order's customer/seller/rider can
 *       drive the relevant transition.</li>
 *   <li>State-machine legality: transitions must appear in
 *       {@link OrderStatusTransitions}.</li>
 *   <li>Idempotency: terminal states admit no further changes.</li>
 * </ul>
 * </p>
 */
public interface OrderService {

    /** Create a new {@code pending} order on behalf of the customer. */
    OrderResponse create(Long actorId, Role actorRole, CreateOrderRequest req);

    /** Seller (owner) accepts a {@code pending} order. */
    OrderResponse accept(Long actorId, Role actorRole, Long orderId);

    /** Seller (owner) rejects a {@code pending} order. {@code reason} optional. */
    OrderResponse reject(Long actorId, Role actorRole, Long orderId, String reason);

    /** Customer (owner) cancels a {@code pending} order. {@code reason} optional. */
    OrderResponse cancel(Long actorId, Role actorRole, Long orderId, String reason);

    /**
     * Rider self-assigns an {@code accepted} order. Atomic on the
     * server — a 409 {@code RIDER_BUSY} is returned if another rider
     * already claimed.
     */
    OrderResponse claim(Long actorId, Role actorRole, Long orderId, Long riderId, String riderName);

    /** Rider (assignee) advances the order to the next delivery status. */
    OrderResponse advance(Long actorId, Role actorRole, Long orderId, OrderStatus next, String note);

    /**
     * List orders, filtered by role + ownership. When the caller is a
     * customer/seller/rider, the corresponding id filter is forced so
     * they can't read other people's orders.
     */
    List<OrderResponse> list(Long actorId, Role actorRole,
                             String customerId, String sellerId, String riderId);

    /**
     * Dispatch queue — orders in {@code accepted} with no rider yet.
     *
     * <p>If {@code actorId} is non-null and the actor is a rider, the
     * result is narrowed to orders from sellers this rider is assigned
     * to via the {@code seller_riders} table. Passing {@code null}
     * returns the global queue (admin/supplier view).</p>
     */
    List<OrderResponse> availableForRiders(Long actorId, Role actorRole);
}
