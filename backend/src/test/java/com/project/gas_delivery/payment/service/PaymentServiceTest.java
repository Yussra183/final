package com.project.gas_delivery.payment.service;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.auth.exception.ResourceNotFoundException;
import com.project.gas_delivery.notification.service.NotificationService;
import com.project.gas_delivery.order.entity.OrderEntity;
import com.project.gas_delivery.order.enums.OrderStatus;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.order.repository.OrderRepository;
import com.project.gas_delivery.payment.dto.PayRequest;
import com.project.gas_delivery.payment.dto.PaymentResponse;
import com.project.gas_delivery.payment.entity.PaymentEntity;
import com.project.gas_delivery.payment.enums.PaymentMethod;
import com.project.gas_delivery.payment.enums.PaymentStatus;
import com.project.gas_delivery.payment.repository.PaymentRepository;
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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link PaymentService}.
 *
 * <p>Coverage:
 * <ul>
 *   <li>{@code pay} — happy path (M-Pesa marks COMPLETED + transactionRef)</li>
 *   <li>{@code pay} — CASH stays PENDING (rider auto-completes on DELIVERED)</li>
 *   <li>{@code pay} — idempotency (a second call returns the existing row)</li>
 *   <li>{@code pay} — M-Pesa requires a phone number</li>
 *   <li>{@code pay} — non-customer actor is rejected</li>
 *   <li>{@code pay} — paying for someone else's order is rejected</li>
 *   <li>{@code pay} — paying on a CANCELLED / REJECTED order is rejected</li>
 *   <li>{@code pay} — seller notification fires on success</li>
 *   <li>{@code markAutoCompletedOnDelivery} — flips PENDING → COMPLETED</li>
 *   <li>{@code markAutoCompletedOnDelivery} — no-op when no active payment</li>
 *   <li>{@code markAutoCompletedOnDelivery} — no-op when already COMPLETED</li>
 *   <li>{@code refund} — happy path: COMPLETED → REFUNDED</li>
 *   <li>{@code refund} — already-REFUNDED is idempotent</li>
 *   <li>{@code refund} — non-completed payment throws</li>
 *   <li>{@code refund} — wrong actor rejected</li>
 *   <li>{@code autoRefundForOrder} — system hook for cancel/reject</li>
 *   <li>{@code listForCustomer / listForSeller} — role guard</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    @Mock
    private PaymentRepository paymentRepository;

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private NotificationService notificationService;

    private PaymentService service;

    @BeforeEach
    void setUp() {
        service = new PaymentService(paymentRepository, orderRepository, notificationService);
    }

    // ---- helpers --------------------------------------------------------

    private OrderEntity order(Long id, Long customerId, Long sellerId,
                              OrderStatus status, String total) {
        OrderEntity o = new OrderEntity(customerId, "Customer", sellerId, "Seller",
                List.of(), new BigDecimal(total), "Test address");
        // The constructor auto-generates an id-less entity; override the id.
        try {
            java.lang.reflect.Field f = OrderEntity.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(o, id);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        o.setStatus(status);
        return o;
    }

    private PaymentEntity payment(Long id, Long orderId, Long customerId, Long sellerId,
                                  BigDecimal amount, PaymentMethod method, PaymentStatus status) {
        PaymentEntity p = new PaymentEntity(orderId, customerId, sellerId, amount, method);
        try {
            java.lang.reflect.Field f = PaymentEntity.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(p, id);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        p.setStatus(status);
        return p;
    }

    // ---- pay ------------------------------------------------------------

    @Test
    void pay_withMpesa_marksCompletedAndGeneratesTransactionRef() {
        Long orderId = 100L;
        Long customerId = 1L;
        Long sellerId = 2L;
        OrderEntity order = order(orderId, customerId, sellerId, OrderStatus.PENDING, "25000.00");
        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
        when(paymentRepository.findActiveByOrderId(orderId)).thenReturn(Optional.empty());
        when(paymentRepository.save(any(PaymentEntity.class))).thenAnswer(inv -> {
            PaymentEntity p = inv.getArgument(0);
            try {
                java.lang.reflect.Field f = PaymentEntity.class.getDeclaredField("id");
                f.setAccessible(true);
                f.set(p, 999L);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
            return p;
        });

        PayRequest req = new PayRequest("100", PaymentMethod.MPESA, "0712345678", null);
        PaymentResponse response = service.pay(customerId, Role.CUSTOMER, req);

        ArgumentCaptor<PaymentEntity> captor = ArgumentCaptor.forClass(PaymentEntity.class);
        verify(paymentRepository).save(captor.capture());
        PaymentEntity saved = captor.getValue();

        assertThat(saved.getStatus()).isEqualTo(PaymentStatus.COMPLETED);
        assertThat(saved.getPaidAt()).isNotNull();
        assertThat(saved.getTransactionRef()).startsWith("TXN-MPESA-");
        assertThat(saved.getTransactionRef()).hasSize("TXN-MPESA-".length() + 6); // 6 hex chars
        assertThat(saved.getPhone()).isEqualTo("0712345678");
        assertThat(saved.getMethod()).isEqualTo(PaymentMethod.MPESA);
        assertThat(response.status()).isEqualTo(PaymentStatus.COMPLETED);
        assertThat(response.transactionRef()).startsWith("TXN-MPESA-");
        verify(notificationService, times(1)).notify(eq(sellerId), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void pay_withCash_staysPendingForRiderCollection() {
        Long orderId = 100L;
        OrderEntity order = order(orderId, 1L, 2L, OrderStatus.PENDING, "18000.00");
        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
        when(paymentRepository.findActiveByOrderId(orderId)).thenReturn(Optional.empty());
        when(paymentRepository.save(any(PaymentEntity.class))).thenAnswer(inv -> inv.getArgument(0));

        PayRequest req = new PayRequest("100", PaymentMethod.CASH, null, "Pay rider");
        PaymentResponse response = service.pay(1L, Role.CUSTOMER, req);

        assertThat(response.status()).isEqualTo(PaymentStatus.PENDING);
        assertThat(response.transactionRef()).isNull();
        assertThat(response.amount()).isEqualByComparingTo("18000.00");
    }

    @Test
    void pay_isIdempotent_returnsExistingActivePayment() {
        Long orderId = 100L;
        Long customerId = 1L;
        OrderEntity order = order(orderId, customerId, 2L, OrderStatus.ACCEPTED, "25000.00");
        PaymentEntity existing = payment(50L, orderId, customerId, 2L,
                new BigDecimal("25000.00"), PaymentMethod.MPESA, PaymentStatus.COMPLETED);
        existing.setTransactionRef("TXN-MPESA-EXISTING");

        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
        when(paymentRepository.findActiveByOrderId(orderId)).thenReturn(Optional.of(existing));

        PayRequest req = new PayRequest("100", PaymentMethod.MPESA, "0712345678", null);
        PaymentResponse response = service.pay(customerId, Role.CUSTOMER, req);

        assertThat(response.id()).isEqualTo("50");
        assertThat(response.transactionRef()).isEqualTo("TXN-MPESA-EXISTING");
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void pay_withMpesaMissingPhone_throwsBadRequest() {
        Long orderId = 100L;
        OrderEntity order = order(orderId, 1L, 2L, OrderStatus.PENDING, "25000.00");
        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
        when(paymentRepository.findActiveByOrderId(orderId)).thenReturn(Optional.empty());

        PayRequest req = new PayRequest("100", PaymentMethod.MPESA, null, null);
        assertThatThrownBy(() -> service.pay(1L, Role.CUSTOMER, req))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Phone");
    }

    @Test
    void pay_nonCustomerActor_throwsNotAuthorized() {
        PayRequest req = new PayRequest("100", PaymentMethod.MPESA, "07", null);
        assertThatThrownBy(() -> service.pay(1L, Role.SELLER, req))
                .isInstanceOf(NotAuthorizedException.class);
    }

    @Test
    void pay_onSomeoneElsesOrder_throwsNotAuthorized() {
        Long orderId = 100L;
        OrderEntity order = order(orderId, 99L, 2L, OrderStatus.PENDING, "25000.00");
        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));

        PayRequest req = new PayRequest("100", PaymentMethod.MPESA, "07", null);
        assertThatThrownBy(() -> service.pay(1L, Role.CUSTOMER, req))
                .isInstanceOf(NotAuthorizedException.class);
    }

    @Test
    void pay_onCancelledOrder_throwsBadRequest() {
        Long orderId = 100L;
        OrderEntity order = order(orderId, 1L, 2L, OrderStatus.CANCELLED, "25000.00");
        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));

        PayRequest req = new PayRequest("100", PaymentMethod.MPESA, "07", null);
        assertThatThrownBy(() -> service.pay(1L, Role.CUSTOMER, req))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("cancelled");
    }

    @Test
    void pay_onRejectedOrder_throwsBadRequest() {
        Long orderId = 100L;
        OrderEntity order = order(orderId, 1L, 2L, OrderStatus.REJECTED, "25000.00");
        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));

        PayRequest req = new PayRequest("100", PaymentMethod.CASH, null, null);
        assertThatThrownBy(() -> service.pay(1L, Role.CUSTOMER, req))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("rejected");
    }

    // ---- markAutoCompletedOnDelivery -----------------------------------

    @Test
    void markAutoCompletedOnDelivery_flipsPendingToCompleted() {
        Long orderId = 100L;
        Long customerId = 1L;
        PaymentEntity pending = payment(50L, orderId, customerId, 2L,
                new BigDecimal("25000.00"), PaymentMethod.CASH, PaymentStatus.PENDING);
        when(paymentRepository.findActiveByOrderId(orderId)).thenReturn(Optional.of(pending));
        when(paymentRepository.save(any(PaymentEntity.class))).thenAnswer(inv -> inv.getArgument(0));

        service.markAutoCompletedOnDelivery(orderId);

        ArgumentCaptor<PaymentEntity> captor = ArgumentCaptor.forClass(PaymentEntity.class);
        verify(paymentRepository).save(captor.capture());
        PaymentEntity saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(PaymentStatus.COMPLETED);
        assertThat(saved.getPaidAt()).isNotNull();
        assertThat(saved.getTransactionRef()).startsWith("TXN-CASH-");
        verify(notificationService, times(1)).notify(eq(customerId), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void markAutoCompletedOnDelivery_noActivePayment_isNoOp() {
        Long orderId = 100L;
        when(paymentRepository.findActiveByOrderId(orderId)).thenReturn(Optional.empty());

        service.markAutoCompletedOnDelivery(orderId);

        verify(paymentRepository, never()).save(any());
        verify(notificationService, never()).notify(anyLong(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void markAutoCompletedOnDelivery_alreadyCompleted_isNoOp() {
        Long orderId = 100L;
        PaymentEntity done = payment(50L, orderId, 1L, 2L,
                new BigDecimal("25000.00"), PaymentMethod.MPESA, PaymentStatus.COMPLETED);
        done.setPaidAt(Instant.now());
        when(paymentRepository.findActiveByOrderId(orderId)).thenReturn(Optional.of(done));

        service.markAutoCompletedOnDelivery(orderId);

        verify(paymentRepository, never()).save(any());
    }

    // ---- refund ---------------------------------------------------------

    @Test
    void refund_completedPayment_flipsToRefunded() {
        Long orderId = 100L;
        Long customerId = 1L;
        PaymentEntity completed = payment(50L, orderId, customerId, 2L,
                new BigDecimal("25000.00"), PaymentMethod.MPESA, PaymentStatus.COMPLETED);
        completed.setTransactionRef("TXN-MPESA-XYZ123");
        when(paymentRepository.findById(50L)).thenReturn(Optional.of(completed));
        when(paymentRepository.save(any(PaymentEntity.class))).thenAnswer(inv -> inv.getArgument(0));

        PaymentResponse response = service.refund(customerId, Role.CUSTOMER, 50L, "Customer requested");

        assertThat(response.status()).isEqualTo(PaymentStatus.REFUNDED);
        assertThat(response.refundedAt()).isNotNull();
        verify(notificationService, times(1)).notify(eq(customerId), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void refund_alreadyRefunded_isIdempotent() {
        Long orderId = 100L;
        PaymentEntity refunded = payment(50L, orderId, 1L, 2L,
                new BigDecimal("25000.00"), PaymentMethod.MPESA, PaymentStatus.REFUNDED);
        when(paymentRepository.findById(50L)).thenReturn(Optional.of(refunded));

        PaymentResponse response = service.refund(1L, Role.CUSTOMER, 50L, "retry");
        assertThat(response.status()).isEqualTo(PaymentStatus.REFUNDED);
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void refund_pendingPayment_throwsBadRequest() {
        Long orderId = 100L;
        PaymentEntity pending = payment(50L, orderId, 1L, 2L,
                new BigDecimal("25000.00"), PaymentMethod.CASH, PaymentStatus.PENDING);
        when(paymentRepository.findById(50L)).thenReturn(Optional.of(pending));

        assertThatThrownBy(() -> service.refund(1L, Role.CUSTOMER, 50L, null))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("COMPLETED");
    }

    @Test
    void refund_otherCustomersPayment_throwsNotAuthorized() {
        Long orderId = 100L;
        PaymentEntity completed = payment(50L, orderId, 99L, 2L,
                new BigDecimal("25000.00"), PaymentMethod.MPESA, PaymentStatus.COMPLETED);
        when(paymentRepository.findById(50L)).thenReturn(Optional.of(completed));

        assertThatThrownBy(() -> service.refund(1L, Role.CUSTOMER, 50L, null))
                .isInstanceOf(NotAuthorizedException.class);
    }

    @Test
    void refund_nonCustomerNonAdmin_throwsNotAuthorized() {
        Long orderId = 100L;
        PaymentEntity completed = payment(50L, orderId, 1L, 2L,
                new BigDecimal("25000.00"), PaymentMethod.MPESA, PaymentStatus.COMPLETED);
        when(paymentRepository.findById(50L)).thenReturn(Optional.of(completed));

        assertThatThrownBy(() -> service.refund(2L, Role.SELLER, 50L, null))
                .isInstanceOf(NotAuthorizedException.class);
    }

    @Test
    void refund_paymentNotFound_throwsResourceNotFound() {
        when(paymentRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.refund(1L, Role.ADMIN, 99L, null))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    // ---- autoRefundForOrder (system hook) ------------------------------

    @Test
    void autoRefundForOrder_completedPayment_flipsToRefunded() {
        Long orderId = 100L;
        PaymentEntity completed = payment(50L, orderId, 1L, 2L,
                new BigDecimal("25000.00"), PaymentMethod.MPESA, PaymentStatus.COMPLETED);
        when(paymentRepository.findActiveByOrderId(orderId)).thenReturn(Optional.of(completed));
        when(paymentRepository.save(any(PaymentEntity.class))).thenAnswer(inv -> inv.getArgument(0));

        service.autoRefundForOrder(orderId, "Order rejected by seller");

        verify(paymentRepository, times(1)).save(any(PaymentEntity.class));
    }

    @Test
    void autoRefundForOrder_noActivePayment_isNoOp() {
        when(paymentRepository.findActiveByOrderId(100L)).thenReturn(Optional.empty());
        service.autoRefundForOrder(100L, "any reason");
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void autoRefundForOrder_pendingPayment_isNoOp() {
        PaymentEntity pending = payment(50L, 100L, 1L, 2L,
                new BigDecimal("25000.00"), PaymentMethod.CASH, PaymentStatus.PENDING);
        when(paymentRepository.findActiveByOrderId(100L)).thenReturn(Optional.of(pending));
        service.autoRefundForOrder(100L, "any reason");
        verify(paymentRepository, never()).save(any());
    }

    // ---- read endpoints -------------------------------------------------

    @Test
    void listForCustomer_returnsOnlyCustomerPayments() {
        Long customerId = 1L;
        PaymentEntity p1 = payment(1L, 100L, customerId, 2L,
                new BigDecimal("25000.00"), PaymentMethod.MPESA, PaymentStatus.COMPLETED);
        when(paymentRepository.findByCustomerIdOrderByUpdatedAtDesc(customerId))
                .thenReturn(List.of(p1));

        List<PaymentResponse> result = service.listForCustomer(customerId, Role.CUSTOMER);
        assertThat(result).hasSize(1);
        assertThat(result.get(0).customerId()).isEqualTo("1");
    }

    @Test
    void listForCustomer_nonCustomer_throwsNotAuthorized() {
        assertThatThrownBy(() -> service.listForCustomer(1L, Role.SELLER))
                .isInstanceOf(NotAuthorizedException.class);
    }

    @Test
    void listForSeller_returnsOnlySellerPayments() {
        Long sellerId = 2L;
        PaymentEntity p1 = payment(1L, 100L, 1L, sellerId,
                new BigDecimal("25000.00"), PaymentMethod.MPESA, PaymentStatus.COMPLETED);
        when(paymentRepository.findBySellerIdOrderByUpdatedAtDesc(sellerId))
                .thenReturn(List.of(p1));

        List<PaymentResponse> result = service.listForSeller(sellerId, Role.SELLER);
        assertThat(result).hasSize(1);
    }

    @Test
    void listForSeller_nonSeller_throwsNotAuthorized() {
        assertThatThrownBy(() -> service.listForSeller(1L, Role.CUSTOMER))
                .isInstanceOf(NotAuthorizedException.class);
    }
}
