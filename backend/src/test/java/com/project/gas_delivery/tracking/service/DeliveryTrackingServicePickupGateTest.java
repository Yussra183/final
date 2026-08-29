package com.project.gas_delivery.tracking.service;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.order.entity.OrderEntity;
import com.project.gas_delivery.order.entity.OrderItemEmbeddable;
import com.project.gas_delivery.order.enums.OrderStatus;
import com.project.gas_delivery.order.repository.OrderRepository;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.repository.RiderApplicationRepository;
import com.project.gas_delivery.supplier.repository.DeliveryTripRepository;
import com.project.gas_delivery.supplier.repository.DeliveryTripStopRepository;
import com.project.gas_delivery.tracking.dto.LocationUpdateRequest;
import com.project.gas_delivery.tracking.exception.TrackingForbiddenException;
import com.project.gas_delivery.tracking.handler.TrackingBroadcaster;
import com.project.gas_delivery.tracking.handler.TrackingSessionRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import tools.jackson.databind.ObjectMapper;

import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The GPS pickup gate.
 *
 * <p>Business rule: a rider's location must not be broadcast until the
 * <em>seller</em> has confirmed physical handover. Holding an order
 * ({@code ASSIGNED}) or merely arriving at the shop
 * ({@code PICKUP_CONFIRMATION_PENDING}) must not put the rider on the
 * customer's map.</p>
 *
 * <p>Hiding the button in the rider app is not enough — anyone can POST
 * to the tracking endpoint directly. These tests pin the enforcement at
 * the service layer, which is the single choke point both the REST
 * controller and the WebSocket handler funnel through.</p>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DeliveryTrackingServicePickupGateTest {

    private static final Long RIDER_ID = 7L;
    private static final Long ORDER_ID = 42L;

    @Mock private OrderRepository orderRepository;
    @Mock private DeliveryTripRepository tripRepository;
    @Mock private DeliveryTripStopRepository tripStopRepository;
    @Mock private RiderApplicationRepository riderApplicationRepository;
    @Mock private TrackingBroadcaster broadcaster;
    @Mock private TrackingSessionRegistry sessionRegistry;

    private DeliveryTrackingService service;

    @BeforeEach
    void setUp() {
        service = new DeliveryTrackingService(
                orderRepository,
                tripRepository,
                tripStopRepository,
                riderApplicationRepository,
                broadcaster,
                sessionRegistry,
                new ObjectMapper()
        );
        // The rider is approved in every case below, so the only thing
        // that can reject the sample is the pickup gate itself.
        when(riderApplicationRepository.findRiderIdsByStatus(PermitStatus.APPROVED))
                .thenReturn(List.of(RIDER_ID));
    }

    @ParameterizedTest(name = "status {0} must NOT broadcast rider GPS")
    @EnumSource(value = OrderStatus.class,
            names = {"ASSIGNED", "PICKUP_CONFIRMATION_PENDING"})
    @DisplayName("GPS is refused before the seller confirms pickup")
    void refusesLocationBeforeSellerConfirmation(OrderStatus status) {
        when(orderRepository.findById(ORDER_ID))
                .thenReturn(Optional.of(orderWith(status)));

        assertThatThrownBy(() ->
                service.ingest(RIDER_ID, Role.RIDER, ORDER_ID, sample()))
                .isInstanceOf(TrackingForbiddenException.class)
                .hasMessageContaining("seller confirms pickup");

        // The gate is only meaningful if nothing reached subscribers and
        // nothing was cached for a later bootstrap to replay.
        verify(broadcaster, never()).broadcast(anyLong(), any());
        assertThat(service.latest(ORDER_ID))
                .as("no position may be cached before pickup confirmation")
                .isNull();
    }

    @ParameterizedTest(name = "status {0} broadcasts rider GPS")
    @EnumSource(value = OrderStatus.class, names = {"PICKED_UP", "IN_TRANSIT"})
    @DisplayName("GPS flows once the seller has confirmed pickup")
    void acceptsLocationAfterSellerConfirmation(OrderStatus status) {
        when(orderRepository.findById(ORDER_ID))
                .thenReturn(Optional.of(orderWith(status)));

        var accepted = service.ingest(RIDER_ID, Role.RIDER, ORDER_ID, sample());

        assertThat(accepted).isNotNull();
        assertThat(accepted.lat()).isEqualTo(-6.16);
        verify(broadcaster).broadcast(anyLong(), any());
    }

    @Test
    @DisplayName("A rider who is not the assignee is still rejected after pickup")
    void rejectsNonAssignedRider() {
        when(orderRepository.findById(ORDER_ID))
                .thenReturn(Optional.of(orderWith(OrderStatus.PICKED_UP)));

        assertThatThrownBy(() ->
                service.ingest(999L, Role.RIDER, ORDER_ID, sample()))
                .isInstanceOf(TrackingForbiddenException.class)
                .hasMessageContaining("assigned rider");
    }

    @Test
    @DisplayName("Terminal orders are dropped silently, not raised as errors")
    void dropsTerminalOrdersSilently() {
        // Pre-existing behaviour, pinned so the new gate doesn't turn a
        // benign straggler sample into a client-visible 403.
        when(orderRepository.findById(ORDER_ID))
                .thenReturn(Optional.of(orderWith(OrderStatus.DELIVERED)));

        assertThat(service.ingest(RIDER_ID, Role.RIDER, ORDER_ID, sample())).isNull();
        verify(broadcaster, never()).broadcast(anyLong(), any());
    }

    // ---- fixtures -------------------------------------------------------

    private static LocationUpdateRequest sample() {
        return new LocationUpdateRequest(
                -6.16, 39.19, null, null, null, null, null);
    }

    /**
     * Builds an order in {@code status} assigned to {@link #RIDER_ID}.
     * {@code id} and {@code status} have no public setters on the entity
     * path we need, so the id is reflected in directly — the entity is a
     * JPA row object, not something we want to widen the API of purely
     * for a test.
     */
    private static OrderEntity orderWith(OrderStatus status) {
        OrderEntity order = new OrderEntity(
                1L, "Customer",
                2L, "Seller",
                List.of(new OrderItemEmbeddable(
                        "1", "Oryx", "6kg", 1, new BigDecimal("25000"))),
                new BigDecimal("25000"),
                "Stone Town"
        );
        order.setStatus(status);
        order.setRiderId(RIDER_ID);
        order.setRiderName("Test Rider");
        setId(order, ORDER_ID);
        return order;
    }

    private static void setId(OrderEntity order, Long id) {
        try {
            Field field = OrderEntity.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(order, id);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Could not seed order id", e);
        }
    }
}
