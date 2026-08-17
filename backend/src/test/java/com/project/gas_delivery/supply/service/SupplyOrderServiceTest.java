package com.project.gas_delivery.supply.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.notification.service.NotificationService;
import com.project.gas_delivery.permit.service.SupplierApplicationService;
import com.project.gas_delivery.product.entity.ProductEntity;
import com.project.gas_delivery.product.repository.ProductRepository;
import com.project.gas_delivery.product.service.StockService;
import com.project.gas_delivery.supply.dto.CreateSupplyOrderRequest;
import com.project.gas_delivery.supply.dto.SupplyOrderDto;
import com.project.gas_delivery.supply.dto.UpdateSupplyOrderStatusRequest;
import com.project.gas_delivery.supply.entity.SupplyOrderEntity;
import com.project.gas_delivery.supply.enums.SupplyOrderStatus;
import com.project.gas_delivery.supply.exception.SupplyOrderException;
import com.project.gas_delivery.supply.repository.SupplyOrderRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * FR-06 unit tests for {@link SupplyOrderService}.
 *
 * <p>Covers the lifecycle guarantees the controller / store rely on:</p>
 * <ol>
 *   <li>Seller-only create.</li>
 *   <li>Seller cannot raise against an unapproved supplier.</li>
 *   <li>Supplier ACCEPTED → PREPARING → DISPATCHED → DELIVERED → seller
 *       RECEIVED is legal at each step.</li>
 *   <li>SELLER cannot deliver (illegal transition).</li>
 *   <li>SUPPLIER cannot RECEIVE (illegal transition).</li>
 *   <li>REJECTED requires a non-empty reason.</li>
 *   <li>RECEIVED increments the matching product's stock by exactly
 *       {@code quantity} (via {@link StockService#replenishForSupplyReceipt}).</li>
 *   <li>RECEIVED with no {@code productId} does not touch stock.</li>
 *   <li>Duplicate notifications for the same transition are suppressed
 *       in a session.</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SupplyOrderServiceTest {

    @Mock private SupplyOrderRepository repository;
    @Mock private SupplierApplicationService supplierApplicationService;
    @Mock private StockService stockService;
    @Mock private NotificationService notificationService;
    @Mock private UserRepository userRepository;
    @Mock private ProductRepository productRepository;

    private SupplyOrderService service;

    @BeforeEach
    void setUp() {
        service = new SupplyOrderService(
                repository, supplierApplicationService, stockService,
                notificationService, userRepository);
    }

    // -----------------------------------------------------------------
    // helpers
    // -----------------------------------------------------------------

    private User seller(Long id, String name) {
        // Use a real User + reflection to set the id (the @GeneratedValue
        // is null at construction time). Mockito's strict stubbing
        // confuses itself when helper-internal stubs are reused across
        // tests; this approach is more robust.
        User u = new User(name, "seller-" + id, "seller" + id + "@test.local",
                "x", "0", Role.SELLER);
        setField(u, "id", id);
        return u;
    }

    private User supplier(Long id, String name) {
        User u = new User(name, "supplier-" + id, "supplier" + id + "@test.local",
                "x", "0", Role.SUPPLIER);
        setField(u, "id", id);
        return u;
    }

    private static void setField(Object target, String name, Object value) {
        try {
            java.lang.reflect.Field f = target.getClass().getDeclaredField(name);
            f.setAccessible(true);
            f.set(target, value);
        } catch (ReflectiveOperationException ex) {
            throw new RuntimeException(ex);
        }
    }

    private ProductEntity product(Long id, long sellerId, int stock, int threshold) {
        return new ProductEntity(
                sellerId, "LPG " + id, "13kg", BigDecimal.valueOf(32_000),
                stock, threshold, "refill", "desc", "🔥");
    }

    private SupplyOrderEntity row(Long id, long sellerId, long supplierId,
                                  long productId, int quantity,
                                  SupplyOrderStatus status) {
        SupplyOrderEntity e = new SupplyOrderEntity(
                sellerId, "Seller-" + sellerId,
                supplierId, supplierId == 0 ? null : "Supplier-" + supplierId,
                "LPG 13kg", "13kg", quantity,
                productId == 0 ? null : productId,
                "notes");
        // supplierId == 0 means "no supplier assigned" — nullify after
        // the constructor (which would otherwise store Long 0).
        if (supplierId == 0L) {
            e.setSupplierId(null);
        }
        // Bypass the @PrePersist by setting id + status via reflection-style
        // accessors. Use the setter that the entity exposes.
        try {
            java.lang.reflect.Field idField = SupplyOrderEntity.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(e, id);
            java.lang.reflect.Field createdAtField = SupplyOrderEntity.class.getDeclaredField("createdAt");
            createdAtField.setAccessible(true);
            createdAtField.set(e, Instant.now());
            java.lang.reflect.Field updatedAtField = SupplyOrderEntity.class.getDeclaredField("updatedAt");
            updatedAtField.setAccessible(true);
            updatedAtField.set(e, Instant.now());
        } catch (ReflectiveOperationException ex) {
            throw new RuntimeException(ex);
        }
        e.setStatus(status);
        return e;
    }

    private void stubFind(SupplyOrderEntity row) {
        when(repository.findById(row.getId())).thenReturn(Optional.of(row));
    }

    private void stubSaveToReturnSameInstance() {
        when(repository.save(any(SupplyOrderEntity.class)))
                .thenAnswer(inv -> inv.getArgument(0));
    }

    // -----------------------------------------------------------------
    // create
    // -----------------------------------------------------------------

    @Test
    void create_onlySellerMayRaise() {
        CreateSupplyOrderRequest req = new CreateSupplyOrderRequest();
        req.setProductName("LPG 13kg");
        req.setSize("13kg");
        req.setQuantity(10);

        assertThatThrownBy(() ->
                service.create(1L, Role.SUPPLIER, req))
                .isInstanceOf(SupplyOrderException.class)
                .extracting("kind").isEqualTo(SupplyOrderException.Kind.FORBIDDEN);
    }

    @Test
    void create_rejectsUnapprovedSupplier() {
        CreateSupplyOrderRequest req = new CreateSupplyOrderRequest();
        req.setProductName("LPG 13kg");
        req.setSize("13kg");
        req.setQuantity(10);
        req.setSupplierId(99L);
        when(userRepository.findById(99L)).thenReturn(Optional.of(supplier(99L, "Acme Gas")));
        when(supplierApplicationService.isApproved(99L)).thenReturn(false);

        assertThatThrownBy(() ->
                service.create(1L, Role.SELLER, req))
                .isInstanceOf(SupplyOrderException.class)
                .extracting("kind")
                .isEqualTo(SupplyOrderException.Kind.SUPPLIER_NOT_APPROVED);
    }

    @Test
    void create_persistsRow_andNotifiesAddressedSupplier() {
        CreateSupplyOrderRequest req = new CreateSupplyOrderRequest();
        req.setProductName("LPG 13kg");
        req.setSize("13kg");
        req.setQuantity(10);
        req.setSupplierId(99L);
        req.setNotes("Please deliver Monday morning");

        when(userRepository.findById(99L)).thenReturn(Optional.of(supplier(99L, "Acme Gas")));
        when(supplierApplicationService.isApproved(99L)).thenReturn(true);
        when(userRepository.findById(1L)).thenReturn(Optional.of(seller(1L, "Bob's Shop")));
        stubSaveToReturnSameInstance();

        SupplyOrderDto dto = service.create(1L, Role.SELLER, req);

        assertThat(dto.getStatus()).isEqualTo("pending");
        assertThat(dto.getSupplierId()).isEqualTo(99L);
        assertThat(dto.getSupplierName()).isEqualTo("Acme Gas");
        assertThat(dto.getQuantity()).isEqualTo(10);

        // One notification to the addressed supplier.
        verify(notificationService, times(1)).notify(
                eq(99L), eq("supply"), anyString(), anyString(), anyString());
    }

    @Test
    void create_withoutSupplierId_createsOpenPoolRow_noNotification() {
        CreateSupplyOrderRequest req = new CreateSupplyOrderRequest();
        req.setProductName("LPG 13kg");
        req.setSize("13kg");
        req.setQuantity(5);
        when(userRepository.findById(1L)).thenReturn(Optional.of(seller(1L, "Bob's Shop")));
        stubSaveToReturnSameInstance();

        SupplyOrderDto dto = service.create(1L, Role.SELLER, req);

        assertThat(dto.getStatus()).isEqualTo("pending");
        assertThat(dto.getSupplierId()).isNull();
        verify(notificationService, never()).notify(
                anyLong(), anyString(), anyString(), anyString(), anyString());
    }

    // -----------------------------------------------------------------
    // state machine
    // -----------------------------------------------------------------

    @Test
    void supplierHappyPath_acceptedToReceived() {
        SupplyOrderEntity row = row(100L, 1L, 99L, 10L, 5, SupplyOrderStatus.PENDING);
        stubFind(row);
        stubSaveToReturnSameInstance();
        when(supplierApplicationService.isApproved(99L)).thenReturn(true);

        service.updateStatus(100L, Role.SUPPLIER, 99L,
                updateReq(SupplyOrderStatus.ACCEPTED));
        service.updateStatus(100L, Role.SUPPLIER, 99L,
                updateReq(SupplyOrderStatus.PREPARING));
        service.updateStatus(100L, Role.SUPPLIER, 99L,
                updateReq(SupplyOrderStatus.DISPATCHED));
        service.updateStatus(100L, Role.SUPPLIER, 99L,
                updateReq(SupplyOrderStatus.DELIVERED));
        service.updateStatus(100L, Role.SELLER, 1L,
                updateReq(SupplyOrderStatus.RECEIVED));

        assertThat(row.getStatus()).isEqualTo(SupplyOrderStatus.RECEIVED);
        assertThat(row.getReceivedAt()).isNotNull();
        assertThat(row.getDispatchedAt()).isNotNull();
        assertThat(row.getDeliveredAt()).isNotNull();
    }

    @Test
    void sellerCannotDeliver() {
        SupplyOrderEntity row = row(101L, 1L, 99L, 10L, 5, SupplyOrderStatus.DISPATCHED);
        stubFind(row);

        assertThatThrownBy(() -> service.updateStatus(101L, Role.SELLER, 1L,
                updateReq(SupplyOrderStatus.DELIVERED)))
                .isInstanceOf(SupplyOrderException.class)
                .extracting("kind")
                .isEqualTo(SupplyOrderException.Kind.ILLEGAL_TRANSITION);
    }

    @Test
    void supplierCannotReceive() {
        SupplyOrderEntity row = row(102L, 1L, 99L, 10L, 5, SupplyOrderStatus.DELIVERED);
        stubFind(row);

        assertThatThrownBy(() -> service.updateStatus(102L, Role.SUPPLIER, 99L,
                updateReq(SupplyOrderStatus.RECEIVED)))
                .isInstanceOf(SupplyOrderException.class)
                .extracting("kind")
                .isEqualTo(SupplyOrderException.Kind.ILLEGAL_TRANSITION);
    }

    @Test
    void terminalStateRejectsAllTransitions() {
        SupplyOrderEntity row = row(103L, 1L, 99L, 10L, 5, SupplyOrderStatus.RECEIVED);
        stubFind(row);

        assertThatThrownBy(() -> service.updateStatus(103L, Role.SUPPLIER, 99L,
                updateReq(SupplyOrderStatus.CANCELLED, "no longer needed")))
                .isInstanceOf(SupplyOrderException.class)
                .extracting("kind")
                .isEqualTo(SupplyOrderException.Kind.ILLEGAL_TRANSITION);
    }

    @Test
    void rejectedRequiresReason() {
        SupplyOrderEntity row = row(104L, 1L, 99L, 10L, 5, SupplyOrderStatus.PENDING);
        stubFind(row);
        when(supplierApplicationService.isApproved(99L)).thenReturn(true);

        assertThatThrownBy(() -> service.updateStatus(104L, Role.SUPPLIER, 99L,
                updateReq(SupplyOrderStatus.REJECTED, "  ")))
                .isInstanceOf(SupplyOrderException.class)
                .extracting("kind")
                .isEqualTo(SupplyOrderException.Kind.REASON_REQUIRED);
    }

    @Test
    void unapprovedSupplierCannotAccept() {
        SupplyOrderEntity row = row(105L, 1L, 99L, 10L, 5, SupplyOrderStatus.PENDING);
        stubFind(row);
        when(supplierApplicationService.isApproved(99L)).thenReturn(false);

        assertThatThrownBy(() -> service.updateStatus(105L, Role.SUPPLIER, 99L,
                updateReq(SupplyOrderStatus.ACCEPTED)))
                .isInstanceOf(SupplyOrderException.class)
                .extracting("kind")
                .isEqualTo(SupplyOrderException.Kind.SUPPLIER_NOT_APPROVED);
    }

    @Test
    void unclaimedPending_canBeAcceptedByAnySupplier() {
        // supplier_id == null on the row; supplier 99 picks it up.
        SupplyOrderEntity row = row(106L, 1L, 0L, 10L, 5, SupplyOrderStatus.PENDING);
        stubFind(row);
        when(supplierApplicationService.isApproved(99L)).thenReturn(true);
        when(userRepository.findById(99L))
                .thenReturn(Optional.of(supplier(99L, "New Supplier")));
        stubSaveToReturnSameInstance();

        SupplyOrderDto dto = service.updateStatus(106L, Role.SUPPLIER, 99L,
                updateReq(SupplyOrderStatus.ACCEPTED));

        assertThat(dto.getStatus()).isEqualTo("accepted");
        assertThat(dto.getSupplierId()).isEqualTo(99L);
        assertThat(dto.getSupplierName()).isEqualTo("New Supplier");
    }

    @Test
    void wrongOwnerCannotActOnRow() {
        SupplyOrderEntity row = row(107L, 1L, 99L, 10L, 5, SupplyOrderStatus.PENDING);
        stubFind(row);

        // Different seller trying to reject.
        assertThatThrownBy(() -> service.updateStatus(107L, Role.SELLER, 2L,
                updateReq(SupplyOrderStatus.CANCELLED, "no longer needed")))
                .isInstanceOf(SupplyOrderException.class)
                .extracting("kind").isEqualTo(SupplyOrderException.Kind.FORBIDDEN);
    }

    @Test
    void idempotentNoOp_whenStatusUnchanged() {
        SupplyOrderEntity row = row(108L, 1L, 99L, 10L, 5, SupplyOrderStatus.PENDING);
        stubFind(row);

        SupplyOrderDto dto = service.updateStatus(108L, Role.SELLER, 1L,
                updateReq(SupplyOrderStatus.PENDING));

        assertThat(dto.getStatus()).isEqualTo("pending");
        verify(notificationService, never()).notify(
                anyLong(), anyString(), anyString(), anyString(), anyString());
    }

    // -----------------------------------------------------------------
    // receipt → stock update
    // -----------------------------------------------------------------

    @Test
    void received_replenishesProductStockExactlyOnce() {
        SupplyOrderEntity row = row(109L, 1L, 99L, 10L, 7, SupplyOrderStatus.DELIVERED);
        stubFind(row);
        stubSaveToReturnSameInstance();
        when(productRepository.findById(10L)).thenReturn(Optional.of(product(10L, 1L, 3, 5)));
        when(productRepository.incrementStock(eq(10L), eq(7))).thenReturn(1);
        when(stockService.replenishForSupplyReceipt(eq(10L), eq(7))).thenReturn(10);

        service.updateStatus(109L, Role.SELLER, 1L,
                updateReq(SupplyOrderStatus.RECEIVED));

        verify(stockService, times(1)).replenishForSupplyReceipt(10L, 7);
    }

    @Test
    void received_withoutProductId_skipsStockUpdate() {
        SupplyOrderEntity row = row(110L, 1L, 99L, 0L, 7, SupplyOrderStatus.DELIVERED);
        // product_id == 0 → entity stored null via the helper.
        row.setProductId(null);
        stubFind(row);
        stubSaveToReturnSameInstance();

        service.updateStatus(110L, Role.SELLER, 1L,
                updateReq(SupplyOrderStatus.RECEIVED));

        verify(stockService, never()).replenishForSupplyReceipt(anyLong(), anyInt());
    }

    // -----------------------------------------------------------------
    // notifications
    // -----------------------------------------------------------------

    @Test
    void rejectionNotifiesSeller_withReason() {
        SupplyOrderEntity row = row(111L, 1L, 99L, 10L, 5, SupplyOrderStatus.PENDING);
        stubFind(row);
        when(supplierApplicationService.isApproved(99L)).thenReturn(true);
        stubSaveToReturnSameInstance();

        service.updateStatus(111L, Role.SUPPLIER, 99L,
                updateReq(SupplyOrderStatus.REJECTED, "out of stock until next week"));

        ArgumentCaptor<String> dataCaptor = ArgumentCaptor.forClass(String.class);
        verify(notificationService, times(1)).notify(
                eq(1L), eq("supply"), anyString(), anyString(),
                dataCaptor.capture());
        assertThat(dataCaptor.getValue()).contains("rejected");
        assertThat(dataCaptor.getValue()).contains("out of stock until next week");
    }

    @Test
    void duplicateNotificationsAreSuppressedPerSession() {
        SupplyOrderEntity row = row(112L, 1L, 99L, 10L, 5, SupplyOrderStatus.PENDING);
        stubFind(row);
        when(supplierApplicationService.isApproved(99L)).thenReturn(true);
        stubSaveToReturnSameInstance();

        // First call fires a notification.
        service.updateStatus(112L, Role.SUPPLIER, 99L,
                updateReq(SupplyOrderStatus.ACCEPTED));
        // Re-fetch returns the saved row with status=ACCEPTED; calling
        // again should be a no-op idempotent and not re-notify.
        when(repository.findById(112L)).thenReturn(Optional.of(row));
        service.updateStatus(112L, Role.SUPPLIER, 99L,
                updateReq(SupplyOrderStatus.ACCEPTED));

        // Only one ACCEPTED notification should ever fire.
        verify(notificationService, times(1)).notify(
                anyLong(), eq("supply"), eq("Supply order accepted"),
                anyString(), anyString());
    }

    // -----------------------------------------------------------------
    // approved-suppliers listing
    // -----------------------------------------------------------------

    @Test
    void unclaimed_returnsOnlyPendingRowsWithNoSupplier() {
        SupplyOrderEntity open = row(200L, 1L, 0L, 10L, 5, SupplyOrderStatus.PENDING);
        when(repository.findUnclaimedPending()).thenReturn(List.of(open));

        List<SupplyOrderDto> out = service.listUnclaimed();

        assertThat(out).hasSize(1);
        assertThat(out.get(0).getId()).isEqualTo(200L);
        verify(repository, never()).findAll();
    }

    // -----------------------------------------------------------------
    // tiny utility
    // -----------------------------------------------------------------

    private UpdateSupplyOrderStatusRequest updateReq(SupplyOrderStatus to) {
        return updateReq(to, null);
    }

    private UpdateSupplyOrderStatusRequest updateReq(SupplyOrderStatus to, String reason) {
        UpdateSupplyOrderStatusRequest r = new UpdateSupplyOrderStatusRequest();
        r.setStatus(to);
        r.setReason(reason);
        return r;
    }
}
