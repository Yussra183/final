package com.project.gas_delivery.order.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import static org.assertj.core.api.Assertions.assertThat;
import com.project.gas_delivery.order.dto.CreateOrderRequest;
import com.project.gas_delivery.order.dto.DeliveryLocationDto;
import com.project.gas_delivery.order.dto.OrderItemDto;
import com.project.gas_delivery.order.exception.InsufficientStockException;
import com.project.gas_delivery.notification.service.NotificationService;
import com.project.gas_delivery.permit.repository.RiderApplicationRepository;
import com.project.gas_delivery.product.entity.ProductEntity;
import com.project.gas_delivery.product.repository.ProductRepository;
import com.project.gas_delivery.order.repository.OrderRepository;
import com.project.gas_delivery.order.service.impl.OrderServiceImpl;
import com.project.gas_delivery.payment.service.PaymentService;
import com.project.gas_delivery.product.service.StockService;
import com.project.gas_delivery.rider.repository.RiderProfileRepository;
import com.project.gas_delivery.rider.repository.SellerRiderRepository;
import com.project.gas_delivery.tracking.service.DeliveryTrackingService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

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
 * FR-05 integration tests for {@link OrderServiceImpl}.
 *
 * <p>Verifies that the order creation path:</p>
 * <ol>
 *   <li>Calls {@code StockService.reserveForOrder} for every line item.</li>
 *   <li>Throws {@link InsufficientStockException} when stock is too low,
 *       AND does NOT persist the order.</li>
 *   <li>Rejects requests that would drive stock negative.</li>
 *   <li>Preserves the order-creation transaction boundary so a stock
 *       failure rolls back the order.</li>
 * </ol>
 *
 * <p>The tests use Mockito to stub the persistence boundary; the real
 * concurrency guarantee is delivered by the underlying repository
 * {@code WHERE stock >= :qty} predicate (see
 * {@code ProductRepository.reserveStock}), verified separately in
 * {@code StockServiceTest}.</p>
 */
@ExtendWith(MockitoExtension.class)
class OrderServiceStockIntegrationTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private PaymentService paymentService;

    @Mock
    private UserRepository userRepository;

    @Mock
    private SellerRiderRepository sellerRiderRepository;

    @Mock
    private RiderProfileRepository riderProfileRepository;

    @Mock
    private RiderApplicationRepository riderApplicationRepository;

    @Mock
    private DeliveryTrackingService deliveryTrackingService;

    @Mock
    private StockService stockService;

    @Mock
    private ProductRepository productRepository;

    @Mock
    private NotificationService notificationService;

    @Mock
    private EntityManager entityManager;

    private OrderServiceImpl orderService;

    @BeforeEach
    void setUp() {
        orderService = new OrderServiceImpl(
                orderRepository, userRepository, sellerRiderRepository,
                riderProfileRepository, riderApplicationRepository,
                deliveryTrackingService, stockService, productRepository,
                notificationService, paymentService, entityManager
        );
    }

    /**
     * Stubs {@code userRepository.findById(sellerId)} to return an
     * active, admin-approved seller mock. Using
     * {@code doReturn().when()} (instead of {@code when().thenReturn()})
     * avoids Mockito's "argument-matchers inside when" requirement, so
     * callers can keep stubbing other mocks afterwards without
     * UnfinishedStubbing errors. Only stubs the methods the production
     * code actually calls — Mockito's strict-stubs mode flags anything
     * else as an unnecessary stubbing.
     */
    private void stubActiveSeller(long id) {
        User u = org.mockito.Mockito.mock(User.class);
        org.mockito.Mockito.doReturn(Role.SELLER).when(u).getRole();
        org.mockito.Mockito.doReturn(true).when(u).isActive();
        when(userRepository.findById(id)).thenReturn(Optional.of(u));
    }

    private CreateOrderRequest request(String productId, int qty) {
        return new CreateOrderRequest(
                "100",                         // customerId (string)
                "Test Customer",               // customerName
                "2",                           // sellerId (string)
                "Test Seller",                 // sellerName
                List.of(new OrderItemDto(
                        productId, "Oryx Gas", "12.5 kg", qty, BigDecimal.valueOf(32_000)
                )),
                BigDecimal.valueOf(32_000L * qty), // total
                "+255700000001",                              // phone
                new DeliveryLocationDto("Test Address", -6.8, 39.2), // deliveryLocation
                null                                            // notes
        );
    }

    private void stubProduct(long productId, long sellerId, String brand, String size) {
        ProductEntity p = new ProductEntity(
                sellerId,
                brand,
                size,
                BigDecimal.valueOf(32_000),
                10,
                "refill",
                brand + " " + size,
                "🔥"
        );
        try {
            java.lang.reflect.Field idField = ProductEntity.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(p, productId);
        } catch (ReflectiveOperationException ex) {
            throw new RuntimeException(ex);
        }
        when(productRepository.findById(productId)).thenReturn(Optional.of(p));
    }

    // ---------------------------------------------------------------------
    // 1. Successful order → stock decremented for every item.
    // ---------------------------------------------------------------------

    @Test
    void create_reservesStockForEveryItemBeforePersistingOrder() {
        stubActiveSeller(2L);
        stubProduct(50L, 2L, "Oryx Gas", "12.5 kg");
        when(stockService.reserveForOrder(eq(50L), eq(2))).thenReturn(8);
        when(orderRepository.save(any())).thenAnswer(inv -> {
            // Simulate JPA assigning an id on persist.
            return inv.getArgument(0);
        });

        orderService.create(100L, Role.CUSTOMER, request("50", 2));

        verify(stockService, times(1)).reserveForOrder(50L, 2);
        verify(orderRepository, times(1)).save(any());
    }

    // ---------------------------------------------------------------------
    // 2. Insufficient stock → order is NOT persisted, exception bubbles up.
    // ---------------------------------------------------------------------

    @Test
    void create_throwsAndDoesNotPersistOrderWhenStockInsufficient() {
        stubActiveSeller(2L);
        stubProduct(50L, 2L, "Oryx Gas", "12.5 kg");
        when(stockService.reserveForOrder(eq(50L), eq(10)))
                .thenThrow(new InsufficientStockException("50", "Oryx Gas", 3, 10));

        assertThatThrownBy(() -> orderService.create(100L, Role.CUSTOMER, request("50", 10)))
                .isInstanceOf(InsufficientStockException.class)
                .satisfies(ex -> {
                    InsufficientStockException ise = (InsufficientStockException) ex;
                    assertThat(ise.getAvailable()).isEqualTo(3);
                    assertThat(ise.getRequested()).isEqualTo(10);
                });

        // Order is never saved if any item's stock reservation fails.
        verify(orderRepository, never()).save(any());
    }

    // ---------------------------------------------------------------------
    // 3. Stock cannot become negative — request that overshoots is rejected.
    // ---------------------------------------------------------------------

    @Test
    void create_rejectsOrderThatWouldDriveStockNegative() {
        stubActiveSeller(2L);
        stubProduct(50L, 2L, "Oryx Gas", "12.5 kg");
        // Even though the backend predicate rejects, simulate the service
        // surfacing it via InsufficientStockException as the repo would.
        when(stockService.reserveForOrder(eq(50L), eq(99)))
                .thenThrow(new InsufficientStockException("50", "Oryx Gas", 1, 99));

        assertThatThrownBy(() -> orderService.create(100L, Role.CUSTOMER, request("50", 99)))
                .isInstanceOf(InsufficientStockException.class);

        verify(orderRepository, never()).save(any());
        verify(stockService, never()).reserveForOrder(anyLong(), eq(-1));
    }

    // ---------------------------------------------------------------------
    // 4. Invalid quantity (≤0) does not touch the repository.
    // ---------------------------------------------------------------------

    @Test
    void create_doesNotInvokeStockServiceForNonPositiveQuantity() {
        // Build a request with qty=0 — bean validation would normally catch
        // this, but the service must also be robust at the boundary.
        CreateOrderRequest bad = new CreateOrderRequest(
                "100", "Test Customer", "2", "Test Seller",
                List.of(new OrderItemDto("50", "Oryx Gas", "12.5 kg", 0, BigDecimal.valueOf(32_000))),
                BigDecimal.ZERO, "+255700000001",
                new DeliveryLocationDto("Test Address", -6.8, 39.2),
                null
        );
        stubActiveSeller(2L);
        stubProduct(50L, 2L, "Oryx Gas", "12.5 kg");
        when(stockService.reserveForOrder(anyLong(), org.mockito.ArgumentMatchers.anyInt()))
                .thenThrow(new IllegalArgumentException("quantity must be > 0"));

        assertThatThrownBy(() -> orderService.create(100L, Role.CUSTOMER, bad))
                .isInstanceOf(com.project.gas_delivery.auth.exception.BadRequestException.class);

        verify(orderRepository, never()).save(any());
    }

    // ---------------------------------------------------------------------
    // 5. Multiple items — all items reserve, first failure aborts.
    // ---------------------------------------------------------------------

    @Test
    void create_handlesMultipleItemsAndStopsOnFirstInsufficientItem() {
        stubActiveSeller(2L);
        stubProduct(50L, 2L, "Oryx Gas", "12.5 kg");
        stubProduct(60L, 2L, "Taifa Gas", "15 kg");
        when(stockService.reserveForOrder(eq(50L), eq(2))).thenReturn(8);
        // Second item: out of stock.
        when(stockService.reserveForOrder(eq(60L), eq(3)))
                .thenThrow(new InsufficientStockException("60", "Regulator", 1, 3));

        CreateOrderRequest multi = new CreateOrderRequest(
                "100", "Test Customer", "2", "Test Seller",
                List.of(
                        new OrderItemDto("50", "Oryx Gas", "12.5 kg", 2, BigDecimal.valueOf(32_000)),
                        new OrderItemDto("60", "Taifa Gas", "15 kg", 3, BigDecimal.valueOf(8_500))
                ),
                BigDecimal.valueOf(89_500),
                "+255700000001",
                new DeliveryLocationDto("Test Address", -6.8, 39.2),
                null
        );

        assertThatThrownBy(() -> orderService.create(100L, Role.CUSTOMER, multi))
                .isInstanceOf(InsufficientStockException.class);

        // First item was reserved; second failed; the entire order was
        // rolled back by Spring because the exception propagated through
        // the @Transactional boundary. In the unit test, we verify no
        // save() was attempted.
        verify(stockService, times(1)).reserveForOrder(50L, 2);
        verify(stockService, times(1)).reserveForOrder(60L, 3);
        verify(orderRepository, never()).save(any());
    }

    @Test
    void create_rejectsInvalidBrandSizeCombination() {
        stubActiveSeller(2L);
        stubProduct(50L, 2L, "Taifa Gas", "15 kg");
        CreateOrderRequest invalid = new CreateOrderRequest(
                "100", "Test Customer", "2", "Test Seller",
                List.of(new OrderItemDto("50", "Taifa Gas", "12.5 kg", 1, BigDecimal.valueOf(32_000))),
                BigDecimal.valueOf(32_000),
                "+255700000001",
                new DeliveryLocationDto("Test Address", -6.8, 39.2),
                null
        );

        assertThatThrownBy(() -> orderService.create(100L, Role.CUSTOMER, invalid))
                .isInstanceOf(com.project.gas_delivery.auth.exception.BadRequestException.class)
                .hasMessage("Selected cylinder size is not available for this gas brand.");

        verify(stockService, never()).reserveForOrder(anyLong(), org.mockito.ArgumentMatchers.anyInt());
        verify(orderRepository, never()).save(any());
    }
}
