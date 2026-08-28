package com.project.gas_delivery.order.service;

import com.project.gas_delivery.order.enums.OrderStatus;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * Server-side mirror of the frontend's
 * {@code ORDER_TRANSITIONS} table in {@code constants/order.ts}.
 *
 * <p>Single source of truth for "is this transition legal for this role?".
 * Adding a new state on the client is a one-liner here too.</p>
 *
 * <p>The contract is identical to the frontend's
 * {@code canTransition(actorRole, from, to)} helper — keep them in sync.</p>
 */
public final class OrderStatusTransitions {

    /** Roles allowed to drive the Order Flow state machine. */
    public enum ActorRole {
        CUSTOMER, SELLER, RIDER
    }

    private static final Map<OrderStatus, Map<OrderStatus, Set<ActorRole>>> RULES =
            new EnumMap<>(OrderStatus.class);

    static {
        // PENDING — seller decisions + customer withdraw
        Map<OrderStatus, Set<ActorRole>> fromPending = new EnumMap<>(OrderStatus.class);
        fromPending.put(OrderStatus.ACCEPTED, EnumSet.of(ActorRole.SELLER));
        fromPending.put(OrderStatus.REJECTED, EnumSet.of(ActorRole.SELLER));
        fromPending.put(OrderStatus.CANCELLED, EnumSet.of(ActorRole.CUSTOMER));
        RULES.put(OrderStatus.PENDING, fromPending);

        // ACCEPTED → ASSIGNED — rider claim (atomic on the server)
        RULES.put(OrderStatus.ACCEPTED,
                Map.of(OrderStatus.ASSIGNED, EnumSet.of(ActorRole.RIDER)));

        // ASSIGNED → PICKUP_CONFIRMATION_PENDING — rider asks the seller
        // for handover. The system treats this as a server-side signal
        // that the rider has reached the pickup point.
        RULES.put(OrderStatus.ASSIGNED,
                Map.of(
                        OrderStatus.PICKUP_CONFIRMATION_PENDING,
                        EnumSet.of(ActorRole.RIDER)
                ));

        // PICKUP_CONFIRMATION_PENDING → PICKED_UP — only the seller can
        // confirm that physical handover happened. The rider's own
        // confirmation is intentionally NOT a valid transition.
        RULES.put(OrderStatus.PICKUP_CONFIRMATION_PENDING,
                Map.of(
                        OrderStatus.PICKED_UP,
                        EnumSet.of(ActorRole.SELLER)
                ));

        // ASSIGNED → ACCEPTED — rider voluntarily releases the hold.
        // The expiration sweep reuses the same back-transition.
        RULES.put(OrderStatus.ASSIGNED,
                Map.of(OrderStatus.ACCEPTED, EnumSet.of(ActorRole.RIDER)));

        // PICKED_UP → IN_TRANSIT → DELIVERED — rider milestones
        RULES.put(OrderStatus.PICKED_UP,
                Map.of(OrderStatus.IN_TRANSIT, EnumSet.of(ActorRole.RIDER)));
        RULES.put(OrderStatus.IN_TRANSIT,
                Map.of(OrderStatus.DELIVERED, EnumSet.of(ActorRole.RIDER)));

        // Terminal states have no outbound transitions.
        RULES.put(OrderStatus.DELIVERED, Map.of());
        RULES.put(OrderStatus.CANCELLED, Map.of());
        RULES.put(OrderStatus.REJECTED, Map.of());
    }

    private OrderStatusTransitions() {
    }

    /**
     * Whether the {@code (actorRole, from, to)} triple is an allowed
     * transition. Mirrors the frontend's
     * {@code canTransition(actorRole, from, to)} in {@code constants/order.ts}.
     */
    public static boolean isAllowed(ActorRole actorRole, OrderStatus from, OrderStatus to) {
        if (actorRole == null || from == null || to == null) return false;
        Map<OrderStatus, Set<ActorRole>> fromMap = RULES.get(from);
        if (fromMap == null) return false;
        Set<ActorRole> actors = fromMap.get(to);
        return actors != null && actors.contains(actorRole);
    }

    /** Terminal states admit no further transitions. */
    public static boolean isTerminal(OrderStatus s) {
        return s == OrderStatus.DELIVERED
                || s == OrderStatus.CANCELLED
                || s == OrderStatus.REJECTED;
    }
}
