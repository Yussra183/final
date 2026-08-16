package com.project.gas_delivery.product.service;

import com.project.gas_delivery.notification.dto.NotificationDto;
import com.project.gas_delivery.notification.service.NotificationService;
import com.project.gas_delivery.order.exception.InsufficientStockException;
import com.project.gas_delivery.product.entity.ProductEntity;
import com.project.gas_delivery.product.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * FR-05 unit tests for {@link StockService}.
 *
 * <p>Covers:</p>
 * <ol>
 *   <li>Successful decrement returns the new stock value.</li>
 *   <li>Insufficient stock throws {@link InsufficientStockException}.</li>
 *   <li>Stock cannot become negative (predicate rejects, exception thrown).</li>
 *   <li>Low-stock notification fires when threshold is reached.</li>
 *   <li>Out-of-stock notification fires when stock reaches 0.</li>
 *   <li>Duplicate alerts are suppressed within a session.</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class StockServiceTest {

    @Mock
    private ProductRepository productRepository;

    @Mock
    private NotificationService notificationService;

    private StockService stockService;

    @BeforeEach
    void setUp() {
        stockService = new StockService(productRepository, notificationService);
    }

    /** Builds a product with the given stock + threshold for the seller. */
    private ProductEntity product(Long id, long sellerId, int stock, int threshold) {
        return new ProductEntity(
                sellerId,
                "LPG " + id,
                "13kg",
                BigDecimal.valueOf(32_000),
                stock,
                threshold,
                "refill",
                "Test product " + id,
                "🔥"
        );
    }

    /** Convenience: stub repository to find a product by id. */
    private void stubFind(Long id, ProductEntity entity) {
        when(productRepository.findById(id)).thenReturn(Optional.of(entity));
    }

    /** Convenience: stub repository to find a missing product (used in error paths). */
    private void stubMissing(Long id) {
        when(productRepository.findById(id)).thenReturn(Optional.empty());
    }

    // ---------------------------------------------------------------------
    // 1. Successful decrement.
    // ---------------------------------------------------------------------

    @Test
    void reserveForOrder_decrementsStockAndReturnsNewValue() {
        ProductEntity product = product(10L, 2L, 12, 5);
        stubFind(10L, product);
        when(productRepository.reserveStock(10L, 3)).thenReturn(1);

        int newStock = stockService.reserveForOrder(10L, 3);

        assertThat(newStock).isEqualTo(9); // 12 - 3
        verify(productRepository).reserveStock(10L, 3);
        // Stock still well above threshold (5) → no notification.
        verify(notificationService, never()).notify(anyLong(), anyString(), anyString(), anyString(), anyString());
    }

    // ---------------------------------------------------------------------
    // 2. Insufficient stock.
    // ---------------------------------------------------------------------

    @Test
    void reserveForOrder_throwsWhenStockBelowRequested() {
        ProductEntity product = product(11L, 2L, 2, 5);
        stubFind(11L, product);
        when(productRepository.reserveStock(11L, 5)).thenReturn(0); // predicate rejected

        assertThatThrownBy(() -> stockService.reserveForOrder(11L, 5))
                .isInstanceOf(InsufficientStockException.class)
                .satisfies(ex -> {
                    InsufficientStockException ise = (InsufficientStockException) ex;
                    assertThat(ise.getProductId()).isEqualTo("11");
                    assertThat(ise.getAvailable()).isEqualTo(2);
                    assertThat(ise.getRequested()).isEqualTo(5);
                });

        verify(notificationService, never()).notify(anyLong(), anyString(), anyString(), anyString(), anyString());
    }

    // ---------------------------------------------------------------------
    // 3. Stock cannot become negative — predicate is the safeguard.
    // ---------------------------------------------------------------------

    @Test
    void reserveForOrder_rejectsRequestThatWouldMakeStockNegative() {
        ProductEntity product = product(12L, 2L, 3, 5);
        stubFind(12L, product);
        // Asking for 5 when only 3 in stock → repository's WHERE stock >= 5
        // predicate returns 0 affected rows.
        when(productRepository.reserveStock(12L, 5)).thenReturn(0);

        assertThatThrownBy(() -> stockService.reserveForOrder(12L, 5))
                .isInstanceOf(InsufficientStockException.class);

        // Crucially: we never call save() with a negative value.
        verify(productRepository, never()).save(any(ProductEntity.class));
    }

    // ---------------------------------------------------------------------
    // 4. Low-stock notification fires when threshold is reached.
    // ---------------------------------------------------------------------

    @Test
    void reserveForOrder_firesLowStockNotificationWhenAtThreshold() {
        // stock=6, threshold=5; requesting 2 → new stock = 4 (below threshold).
        ProductEntity product = product(13L, 2L, 6, 5);
        stubFind(13L, product);
        when(productRepository.reserveStock(13L, 2)).thenReturn(1);

        stockService.reserveForOrder(13L, 2);

        ArgumentCaptor<String> titleCap = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> messageCap = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> typeCap = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> dataCap = ArgumentCaptor.forClass(String.class);
        verify(notificationService, times(1)).notify(
                eq(2L), typeCap.capture(), titleCap.capture(),
                messageCap.capture(), dataCap.capture()
        );
        assertThat(typeCap.getValue()).isEqualTo("stock");
        assertThat(titleCap.getValue()).contains("Low stock");
        assertThat(messageCap.getValue()).contains("4 units").contains("threshold of 5");
        // Data JSON should expose product + stock + threshold for the seller UI.
        assertThat(dataCap.getValue()).contains("\"stock\":4").contains("\"threshold\":5")
                .contains("\"outOfStock\":false");
    }

    // ---------------------------------------------------------------------
    // 5. Out-of-stock notification fires when stock reaches 0.
    // ---------------------------------------------------------------------

    @Test
    void reserveForOrder_firesOutOfStockNotificationWhenStockHitsZero() {
        // stock=3, threshold=5; requesting 3 → new stock = 0.
        ProductEntity product = product(14L, 2L, 3, 5);
        stubFind(14L, product);
        when(productRepository.reserveStock(14L, 3)).thenReturn(1);

        stockService.reserveForOrder(14L, 3);

        ArgumentCaptor<String> titleCap = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> messageCap = ArgumentCaptor.forClass(String.class);
        verify(notificationService, times(1)).notify(
                eq(2L), anyString(), titleCap.capture(), messageCap.capture(), anyString()
        );
        assertThat(titleCap.getValue()).contains("Out of stock");
        assertThat(messageCap.getValue()).contains("run out of stock");
    }

    // ---------------------------------------------------------------------
    // 6. Duplicate alerts are suppressed within a session.
    // ---------------------------------------------------------------------

    @Test
    void reserveForOrder_doesNotFireDuplicateLowStockNotification() {
        // stock=6, threshold=5; request 1 → newStock=5 (at threshold, fires).
        ProductEntity product = product(15L, 2L, 6, 5);
        stubFind(15L, product);
        when(productRepository.reserveStock(15L, 1)).thenReturn(1);

        // First call should fire.
        stockService.reserveForOrder(15L, 1);
        verify(notificationService, times(1)).notify(
                anyLong(), anyString(), anyString(), anyString(), anyString());

        // Second call (still below threshold, same product) should NOT fire.
        stockService.reserveForOrder(15L, 1);
        verify(notificationService, times(1)).notify(
                anyLong(), anyString(), anyString(), anyString(), anyString());
    }

    // ---------------------------------------------------------------------
    // 7. Manual stock application also honours threshold + recovery.
    // ---------------------------------------------------------------------

    @Test
    void applyManualStock_firesLowStockWhenSellerDropsBelowThreshold() {
        ProductEntity product = product(16L, 2L, 20, 5);
        stubFind(16L, product);
        when(productRepository.save(any(ProductEntity.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        stockService.applyManualStock(16L, 3);

        verify(notificationService, times(1)).notify(
                eq(2L), eq("stock"), anyString(), anyString(), anyString());
    }

    @Test
    void applyManualStock_reArmsThresholdAfterRecovery() {
        ProductEntity product = product(17L, 2L, 4, 5);
        stubFind(17L, product);
        when(productRepository.save(any(ProductEntity.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        // First call: stock=4 (at threshold) → notification fires.
        stockService.applyManualStock(17L, 4);
        verify(notificationService, times(1)).notify(
                anyLong(), anyString(), anyString(), anyString(), anyString());

        // Seller restocks back above threshold → no second notification,
        // and the dedupe key is cleared so a future fall can re-fire.
        stockService.applyManualStock(17L, 20);
        verify(notificationService, times(1)).notify(
                anyLong(), anyString(), anyString(), anyString(), anyString());
        // The entity's id is null in unit tests (no JPA persist), so the
        // dedupe map uses a synthetic key (sellerId+name) and clears it
        // when stock rises above the threshold.
        assertThat(stockService.recentlyNotifiedIds())
                .as("after restock above threshold, dedupe is cleared")
                .isEmpty();

        // Stock falls below threshold again → next notification fires.
        stockService.applyManualStock(17L, 2);
        verify(notificationService, times(2)).notify(
                anyLong(), anyString(), anyString(), anyString(), anyString());
    }

    // ---------------------------------------------------------------------
    // 8. Negative quantity is rejected up front.
    // ---------------------------------------------------------------------

    @Test
    void reserveForOrder_rejectsNonPositiveQuantity() {
        assertThatThrownBy(() -> stockService.reserveForOrder(1L, 0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> stockService.reserveForOrder(1L, -1))
                .isInstanceOf(IllegalArgumentException.class);
        verify(productRepository, never()).reserveStock(anyLong(), anyInt());
    }

    // ---------------------------------------------------------------------
    // 9. Missing product → insufficient-stock error with available=0.
    // ---------------------------------------------------------------------

    @Test
    void reserveForOrder_throwsInsufficientWhenProductMissing() {
        stubMissing(99L);

        assertThatThrownBy(() -> stockService.reserveForOrder(99L, 1))
                .isInstanceOf(InsufficientStockException.class)
                .satisfies(ex -> {
                    InsufficientStockException ise = (InsufficientStockException) ex;
                    assertThat(ise.getAvailable()).isZero();
                    assertThat(ise.getRequested()).isEqualTo(1);
                });
    }
}
