package com.project.gas_delivery.order.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.notification.service.NotificationService;
import com.project.gas_delivery.order.entity.OrderEntity;
import com.project.gas_delivery.order.entity.OrderItemEmbeddable;
import com.project.gas_delivery.order.enums.OrderStatus;
import com.project.gas_delivery.order.exception.RiderBusyException;
import com.project.gas_delivery.order.repository.OrderRepository;
import com.project.gas_delivery.order.service.impl.OrderServiceImpl;
import com.project.gas_delivery.payment.service.PaymentService;
import com.project.gas_delivery.permit.entity.RiderApplicationEntity;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.repository.RiderApplicationRepository;
import com.project.gas_delivery.product.repository.ProductRepository;
import com.project.gas_delivery.product.service.StockService;
import com.project.gas_delivery.rider.entity.RiderProfileEntity;
import com.project.gas_delivery.rider.repository.RiderProfileRepository;
import com.project.gas_delivery.rider.repository.SellerRiderRepository;
import com.project.gas_delivery.tracking.service.DeliveryTrackingService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderServiceRiderDispatchTest {

    @Mock private OrderRepository orderRepository;
    @Mock private UserRepository userRepository;
    @Mock private SellerRiderRepository sellerRiderRepository;
    @Mock private RiderProfileRepository riderProfileRepository;
    @Mock private RiderApplicationRepository riderApplicationRepository;
    @Mock private DeliveryTrackingService deliveryTrackingService;
    @Mock private StockService stockService;
    @Mock private ProductRepository productRepository;
    @Mock private NotificationService notificationService;
    @Mock private PaymentService paymentService;
    @Mock private EntityManager entityManager;

    private OrderServiceImpl orderService;

    @BeforeEach
    void setUp() {
        orderService = new OrderServiceImpl(
                orderRepository,
                userRepository,
                sellerRiderRepository,
                riderProfileRepository,
                riderApplicationRepository,
                deliveryTrackingService,
                stockService,
                productRepository,
                notificationService,
                paymentService,
                entityManager
        );
    }

    @Test
    void approvedAvailableRiderCanSeeAvailableOrders() {
        when(orderRepository.findAvailableForDispatch()).thenReturn(List.of(
                order(101L, 15L, "Seller A", OrderStatus.ACCEPTED, null),
                order(105L, 22L, "Seller B", OrderStatus.ACCEPTED, null)
        ));
        when(riderApplicationRepository.findByRiderId(7L)).thenReturn(Optional.of(approvedApplication(7L)));
        when(riderProfileRepository.findById(7L)).thenReturn(Optional.of(riderProfile(7L, true)));

        var available = orderService.availableForRiders(7L, Role.RIDER);

        assertThat(available).hasSize(2);
        assertThat(available).extracting("sellerId").containsExactly("15", "22");
        verifyNoInteractions(sellerRiderRepository);
    }

    @Test
    void dispatchQueueOnlyContainsAcceptedUnassignedOrders() {
        when(orderRepository.findAvailableForDispatch()).thenReturn(List.of(
                order(101L, 15L, "Seller A", OrderStatus.ACCEPTED, null),
                order(102L, 15L, "Seller A", OrderStatus.ACCEPTED, null)
        ));
        when(riderApplicationRepository.findByRiderId(7L)).thenReturn(Optional.of(approvedApplication(7L)));
        when(riderProfileRepository.findById(7L)).thenReturn(Optional.of(riderProfile(7L, true)));

        var available = orderService.availableForRiders(7L, Role.RIDER);

        assertThat(available)
                .extracting("id", "status", "riderId")
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("101", OrderStatus.ACCEPTED, null),
                        org.assertj.core.groups.Tuple.tuple("102", OrderStatus.ACCEPTED, null)
                );
    }

    @Test
    void onlyAvailableRidersSeeDispatchQueue() {
        when(orderRepository.findAvailableForDispatch()).thenReturn(List.of(
                order(101L, 15L, "Seller A", OrderStatus.ACCEPTED, null)
        ));
        when(riderApplicationRepository.findByRiderId(7L)).thenReturn(Optional.of(approvedApplication(7L)));
        when(riderProfileRepository.findById(7L)).thenReturn(Optional.of(riderProfile(7L, false)));

        var available = orderService.availableForRiders(7L, Role.RIDER);

        assertThat(available).isEmpty();
    }

    @Test
    void riderCanAcceptOrderFromAnySellerAndBecomesBusy() {
        RiderProfileEntity profile = riderProfile(7L, true);
        OrderEntity before = order(101L, 15L, "Seller A", OrderStatus.ACCEPTED, null);
        OrderEntity after = order(101L, 15L, "Seller A", OrderStatus.ASSIGNED, 7L);
        before.setCustomerId(99L);
        before.setCustomerName("Customer");
        after.setCustomerId(99L);
        after.setCustomerName("Customer");
        after.setRiderName("Rider One");
        Query query = claimQueryReturningSuccess();

        when(userRepository.findById(7L)).thenReturn(Optional.of(riderUser(7L)));
        when(riderApplicationRepository.findByRiderId(7L)).thenReturn(Optional.of(approvedApplication(7L)));
        when(riderProfileRepository.findById(7L)).thenReturn(Optional.of(profile));
        when(orderRepository.findById(101L)).thenReturn(Optional.of(before), Optional.of(after));
        when(entityManager.createNativeQuery(anyString())).thenReturn(query);

        var claimed = orderService.claim(7L, Role.RIDER, 101L, 7L, "Rider One");

        assertThat(claimed.id()).isEqualTo("101");
        assertThat(claimed.sellerId()).isEqualTo("15");
        assertThat(claimed.riderId()).isEqualTo("7");
        assertThat(profile.isAvailable()).isFalse();
        verify(riderProfileRepository).save(profile);
        verify(notificationService, org.mockito.Mockito.times(2))
                .notify(anyLong(), anyString(), anyString(), anyString(), anyString());
        verifyNoInteractions(sellerRiderRepository);
    }

    @Test
    void secondRiderCannotAcceptSameOrder() {
        when(userRepository.findById(8L)).thenReturn(Optional.of(riderUser(8L)));
        when(riderApplicationRepository.findByRiderId(8L)).thenReturn(Optional.of(approvedApplication(8L)));
        when(riderProfileRepository.findById(8L)).thenReturn(Optional.of(riderProfile(8L, true)));
        when(orderRepository.findById(101L)).thenReturn(Optional.of(order(101L, 15L, "Seller A", OrderStatus.ACCEPTED, null)));
        Query query = claimQueryReturningNoRows();
        when(entityManager.createNativeQuery(anyString())).thenReturn(query);

        assertThatThrownBy(() -> orderService.claim(8L, Role.RIDER, 101L, 8L, "Rider Two"))
                .isInstanceOf(RiderBusyException.class)
                .hasMessage("Order is no longer available.");

        verify(riderProfileRepository, never()).save(any());
    }

    @Test
    void completingOrderMakesRiderAvailableAgain() {
        RiderProfileEntity profile = riderProfile(7L, false);
        OrderEntity inTransit = order(101L, 15L, "Seller A", OrderStatus.IN_TRANSIT, 7L);
        OrderEntity delivered = order(101L, 15L, "Seller A", OrderStatus.DELIVERED, 7L);

        when(orderRepository.findById(101L)).thenReturn(Optional.of(inTransit));
        when(orderRepository.save(inTransit)).thenAnswer(inv -> {
            inTransit.setStatus(OrderStatus.DELIVERED);
            return delivered;
        });
        when(riderProfileRepository.findById(7L)).thenReturn(Optional.of(profile));

        var response = orderService.advance(7L, Role.RIDER, 101L, OrderStatus.DELIVERED, null);

        assertThat(response.status()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(profile.isAvailable()).isTrue();
        verify(riderProfileRepository).save(profile);
    }

    @Test
    void sameRiderCanLaterAcceptOrderFromDifferentSeller() {
        RiderProfileEntity profile = riderProfile(7L, false);
        OrderEntity completedOrder = order(101L, 15L, "Seller A", OrderStatus.IN_TRANSIT, 7L);
        OrderEntity nextAvailable = order(110L, 33L, "Seller B", OrderStatus.ACCEPTED, null);
        OrderEntity nextAssigned = order(110L, 33L, "Seller B", OrderStatus.ASSIGNED, 7L);

        when(orderRepository.findById(101L)).thenReturn(Optional.of(completedOrder));
        when(orderRepository.save(completedOrder)).thenAnswer(inv -> {
            completedOrder.setStatus(OrderStatus.DELIVERED);
            return order(101L, 15L, "Seller A", OrderStatus.DELIVERED, 7L);
        });
        when(riderProfileRepository.findById(7L))
                .thenReturn(Optional.of(profile))
                .thenReturn(Optional.of(profile));
        when(userRepository.findById(7L)).thenReturn(Optional.of(riderUser(7L)));
        when(riderApplicationRepository.findByRiderId(7L)).thenReturn(Optional.of(approvedApplication(7L)));
        when(orderRepository.findById(110L)).thenReturn(Optional.of(nextAvailable), Optional.of(nextAssigned));
        when(entityManager.createNativeQuery(anyString())).thenReturn(claimQueryReturningSuccess());

        orderService.advance(7L, Role.RIDER, 101L, OrderStatus.DELIVERED, null);
        var claimed = orderService.claim(7L, Role.RIDER, 110L, 7L, "Rider One");

        assertThat(claimed.sellerId()).isEqualTo("33");
        assertThat(profile.isAvailable()).isFalse();
        verifyNoInteractions(sellerRiderRepository);
    }

    @Test
    void riderListShowsOnlyAssignedOrdersNotSellerAssignmentQueue() {
        when(orderRepository.findByRiderIdOrderByUpdatedAtDesc(7L)).thenReturn(List.of(
                order(101L, 15L, "Seller A", OrderStatus.ASSIGNED, 7L),
                order(110L, 33L, "Seller B", OrderStatus.PICKED_UP, 7L)
        ));

        var orders = orderService.list(7L, Role.RIDER, null, null, null);

        assertThat(orders).hasSize(2);
        verify(orderRepository).findByRiderIdOrderByUpdatedAtDesc(7L);
        verifyNoInteractions(sellerRiderRepository);
    }

    @Test
    void sellerAcceptanceNotifiesCustomerAndAvailableApprovedRiders() {
        OrderEntity pending = order(101L, 15L, "Seller A", OrderStatus.PENDING, null);
        pending.setCustomerId(99L);
        pending.setCustomerName("Customer");
        RiderProfileEntity approvedAvailable = riderProfile(7L, true);
        RiderProfileEntity approvedAvailableTwo = riderProfile(8L, true);
        RiderProfileEntity notApproved = riderProfile(9L, true);

        when(orderRepository.findById(101L)).thenReturn(Optional.of(pending));
        when(orderRepository.save(pending)).thenAnswer(inv -> pending);
        when(riderApplicationRepository.findRiderIdsByStatus(PermitStatus.APPROVED)).thenReturn(List.of(7L, 8L));
        when(riderProfileRepository.findByAvailable(true)).thenReturn(List.of(
                approvedAvailable,
                approvedAvailableTwo,
                notApproved
        ));

        orderService.accept(15L, Role.SELLER, 101L);

        ArgumentCaptor<Long> recipientIds = ArgumentCaptor.forClass(Long.class);
        verify(notificationService, org.mockito.Mockito.times(3))
                .notify(recipientIds.capture(), anyString(), anyString(), anyString(), anyString());
        assertThat(recipientIds.getAllValues()).containsExactlyInAnyOrder(99L, 7L, 8L);
    }

    @Test
    void unapprovedRiderCannotClaimDelivery() {
        when(userRepository.findById(7L)).thenReturn(Optional.of(riderUser(7L)));
        when(riderApplicationRepository.findByRiderId(7L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> orderService.claim(7L, Role.RIDER, 101L, 7L, "Rider One"))
                .isInstanceOf(com.project.gas_delivery.order.exception.NotAuthorizedException.class)
                .hasMessage("Only approved riders can accept deliveries.");

        verifyNoInteractions(orderRepository);
    }

    private Query claimQueryReturningSuccess() {
        Query query = org.mockito.Mockito.mock(Query.class);
        when(query.setParameter(anyString(), any())).thenReturn(query);
        when(query.getResultList()).thenReturn(List.of(101L));
        return query;
    }

    private Query claimQueryReturningNoRows() {
        Query query = org.mockito.Mockito.mock(Query.class);
        when(query.setParameter(anyString(), any())).thenReturn(query);
        when(query.getResultList()).thenReturn(List.of());
        return query;
    }

    private RiderApplicationEntity approvedApplication(Long riderId) {
        RiderApplicationEntity entity = new RiderApplicationEntity(riderId);
        entity.setStatus(PermitStatus.APPROVED);
        return entity;
    }

    private RiderProfileEntity riderProfile(Long riderId, boolean available) {
        return new RiderProfileEntity(
                riderId,
                "motorcycle",
                null,
                null,
                null,
                available,
                "+255700000000",
                null,
                null,
                null,
                null,
                null,
                null
        );
    }

    private User riderUser(Long riderId) {
        User rider = org.mockito.Mockito.mock(User.class);
        doReturn(riderId).when(rider).getId();
        doReturn(Role.RIDER).when(rider).getRole();
        doReturn("Rider One").when(rider).getFullName();
        doReturn("+255700000000").when(rider).getPhone();
        return rider;
    }

    private OrderEntity order(Long orderId, Long sellerId, String sellerName, OrderStatus status, Long riderId) {
        OrderEntity entity = new OrderEntity(
                99L,
                "Customer",
                sellerId,
                sellerName,
                List.of(new OrderItemEmbeddable("50", "Oryx Gas", "12.5kg", 2, BigDecimal.valueOf(32000))),
                BigDecimal.valueOf(64000),
                "Stone Town"
        );
        entity.setStatus(status);
        entity.setRiderId(riderId);
        entity.setRiderName(riderId == null ? null : "Rider One");
        entity.setDeliveryLat(-6.17);
        entity.setDeliveryLng(39.21);
        setField(entity, "id", orderId);
        setField(entity, "createdAt", Instant.parse("2026-08-17T10:00:00Z"));
        setField(entity, "updatedAt", Instant.parse("2026-08-17T10:00:00Z"));
        return entity;
    }

    private void setField(Object target, String field, Object value) {
        try {
            var declaredField = target.getClass().getDeclaredField(field);
            declaredField.setAccessible(true);
            declaredField.set(target, value);
        } catch (ReflectiveOperationException ex) {
            throw new RuntimeException(ex);
        }
    }
}
