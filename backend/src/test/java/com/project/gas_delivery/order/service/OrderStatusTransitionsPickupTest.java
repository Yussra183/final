package com.project.gas_delivery.order.service;

import com.project.gas_delivery.order.enums.OrderStatus;
import com.project.gas_delivery.order.service.OrderStatusTransitions.ActorRole;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression coverage for the rider pickup state machine.
 *
 * <p>The table in {@link OrderStatusTransitions} is built from a static
 * initialiser of {@code RULES.put(...)} calls. That shape has one sharp
 * edge: two {@code put}s for the same {@code from} state silently
 * clobber each other rather than merging, and the loss is invisible
 * until a rider taps a button in production and gets a 409.</p>
 *
 * <p>These tests pin every legal edge of the pickup workflow so a future
 * edit that re-introduces a duplicate {@code put} fails here instead.</p>
 */
class OrderStatusTransitionsPickupTest {

    @Test
    @DisplayName("ASSIGNED keeps BOTH rider exits — request-pickup and release-hold")
    void assignedRetainsBothRiderExits() {
        // The clobber bug: a second RULES.put(ASSIGNED, …) dropped this edge
        // entirely, so "Request Pickup Confirmation" threw InvalidTransition.
        assertThat(OrderStatusTransitions.isAllowed(
                ActorRole.RIDER,
                OrderStatus.ASSIGNED,
                OrderStatus.PICKUP_CONFIRMATION_PENDING))
                .as("rider must be able to ask the seller for handover")
                .isTrue();

        assertThat(OrderStatusTransitions.isAllowed(
                ActorRole.RIDER,
                OrderStatus.ASSIGNED,
                OrderStatus.ACCEPTED))
                .as("rider must still be able to release the hold")
                .isTrue();
    }

    @Test
    @DisplayName("Only the SELLER can confirm physical pickup")
    void onlySellerConfirmsPickup() {
        assertThat(OrderStatusTransitions.isAllowed(
                ActorRole.SELLER,
                OrderStatus.PICKUP_CONFIRMATION_PENDING,
                OrderStatus.PICKED_UP))
                .isTrue();

        // The core business rule — the rider's own claim must never be
        // enough to move the order into PICKED_UP.
        assertThat(OrderStatusTransitions.isAllowed(
                ActorRole.RIDER,
                OrderStatus.PICKUP_CONFIRMATION_PENDING,
                OrderStatus.PICKED_UP))
                .as("a rider must not be able to self-confirm pickup")
                .isFalse();
    }

    @Test
    @DisplayName("A rider cannot skip the seller and jump ASSIGNED → PICKED_UP")
    void riderCannotSkipSellerConfirmation() {
        assertThat(OrderStatusTransitions.isAllowed(
                ActorRole.RIDER,
                OrderStatus.ASSIGNED,
                OrderStatus.PICKED_UP))
                .isFalse();
    }

    @Test
    @DisplayName("Rider may release the hold while waiting on an unresponsive seller")
    void riderMayReleaseHoldWhileAwaitingConfirmation() {
        assertThat(OrderStatusTransitions.isAllowed(
                ActorRole.RIDER,
                OrderStatus.PICKUP_CONFIRMATION_PENDING,
                OrderStatus.ACCEPTED))
                .isTrue();
    }

    @Test
    @DisplayName("Post-pickup rider milestones remain intact")
    void postPickupMilestonesUnchanged() {
        assertThat(OrderStatusTransitions.isAllowed(
                ActorRole.RIDER, OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT)).isTrue();
        assertThat(OrderStatusTransitions.isAllowed(
                ActorRole.RIDER, OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED)).isTrue();
    }

    @Test
    @DisplayName("Pre-pickup seller/customer decisions are untouched by the pickup work")
    void unrelatedFlowsUnaffected() {
        assertThat(OrderStatusTransitions.isAllowed(
                ActorRole.SELLER, OrderStatus.PENDING, OrderStatus.ACCEPTED)).isTrue();
        assertThat(OrderStatusTransitions.isAllowed(
                ActorRole.SELLER, OrderStatus.PENDING, OrderStatus.REJECTED)).isTrue();
        assertThat(OrderStatusTransitions.isAllowed(
                ActorRole.CUSTOMER, OrderStatus.PENDING, OrderStatus.CANCELLED)).isTrue();
        assertThat(OrderStatusTransitions.isAllowed(
                ActorRole.RIDER, OrderStatus.ACCEPTED, OrderStatus.ASSIGNED)).isTrue();
    }

    @Test
    @DisplayName("Terminal states admit nothing further")
    void terminalStatesAreClosed() {
        assertThat(OrderStatusTransitions.isTerminal(OrderStatus.DELIVERED)).isTrue();
        assertThat(OrderStatusTransitions.isTerminal(OrderStatus.CANCELLED)).isTrue();
        assertThat(OrderStatusTransitions.isTerminal(OrderStatus.REJECTED)).isTrue();
        assertThat(OrderStatusTransitions.isAllowed(
                ActorRole.RIDER, OrderStatus.DELIVERED, OrderStatus.IN_TRANSIT)).isFalse();
    }
}
