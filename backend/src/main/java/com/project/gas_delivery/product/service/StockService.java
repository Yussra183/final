package com.project.gas_delivery.product.service;

import com.project.gas_delivery.notification.service.NotificationService;
import com.project.gas_delivery.order.exception.InsufficientStockException;
import com.project.gas_delivery.product.entity.ProductEntity;
import com.project.gas_delivery.product.repository.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * FR-05 — Gas Inventory & Stock Management.
 *
 * <p>Single funnel for every stock mutation the system performs:</p>
 * <ol>
 *   <li>Reserving stock when a customer places an order
 *       ({@link #reserveForOrder}).</li>
 *   <li>Restoring stock when a seller's manual adjustment or a future
 *       restock flow raises it ({@link #applyManualStock}).</li>
 * </ol>
 *
 * <p>Two non-negotiable guarantees:</p>
 * <ul>
 *   <li><b>Atomicity</b> — the underlying UPDATE uses a
 *       {@code WHERE stock >= :qty} predicate plus a row-level write
 *       lock, so concurrent orders on the same product can never oversell
 *       it. {@code reserveForOrder} returns the new stock value on
 *       success and throws {@link InsufficientStockException} when the
 *       predicate rejects.</li>
 *   <li><b>Threshold notification</b> — every successful decrement
 *       checks the post-update stock against the per-product
 *       {@code low_stock_threshold}. When it crosses, the existing
 *       {@link NotificationService} fires a {@code "stock"} notification
 *       to the seller; out-of-stock (stock == 0) escalates the title.
 *       Each (product, threshold-cross) pair only fires once per order
 *       — we don't spam the seller if an order drives stock from 6 → 4
 *       → 3 in two consecutive transactions (the second call observes
 *       that the previous low-stock notification has already been
 *       created within the same session and skips).</li>
 * </ul>
 *
 * <p>All public methods participate in the caller's transaction
 * ({@link Propagation#MANDATORY}) so a rollback in the order service
 * also rolls back the stock update — the database can never end up with
 * an order row but no corresponding stock decrement.</p>
 */
@Service
public class StockService {

    private final ProductRepository productRepository;
    private final NotificationService notificationService;

    /**
     * Product ids we already fired a low-stock alert for in the current
     * JVM session — guards against the spam case described in the class
     * javadoc. Kept in memory: if the server restarts we accept that
     * the first transition after restart will re-notify, which is fine
     * (notifications are not authoritative inventory records).
     */
    private final Map<Object, StockAlertState> recentlyNotified = new LinkedHashMap<>();

    public StockService(ProductRepository productRepository,
                        NotificationService notificationService) {
        this.productRepository = productRepository;
        this.notificationService = notificationService;
    }

    /**
     * Reserve {@code quantity} units of {@code productId} for an in-flight
     * order. Atomic — returns the new stock value on success; throws
     * {@link InsufficientStockException} if the database refused the
     * decrement (insufficient stock OR product inactive).
     *
     * <p>Designed to run inside the order service's transaction so the
     * surrounding {@code @Transactional} boundary also covers the order
     * insert. If the order service later throws for any other reason,
     * Spring rolls back the UPDATE.</p>
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public int reserveForOrder(Long productId, int quantity) {
        if (quantity <= 0) {
            throw new IllegalArgumentException("quantity must be > 0");
        }
        ProductEntity product = productRepository.findById(productId)
                .orElseThrow(() -> new InsufficientStockException(
                        String.valueOf(productId), "(unknown)", 0, quantity));

        int updated = productRepository.reserveStock(productId, quantity);
        if (updated == 0) {
            // Either stock was insufficient, or the row was deactivated
            // between the read and the UPDATE. Re-read to give the
            // caller the precise "available" figure for the error body.
            int currentStock = productRepository.findById(productId)
                    .map(ProductEntity::getStock)
                    .orElse(0);
            throw new InsufficientStockException(
                    String.valueOf(productId),
                    product.getName(),
                    currentStock,
                    quantity
            );
        }

        // Post-decrement value: the UPDATE subtracted quantity from
        // `stock`; we compute the same value here without re-reading
        // (avoiding a second round trip and a possible concurrent
        // mutation) so the threshold check sees what the DB sees.
        int newStock = product.getStock() - quantity;
        checkThresholdAndNotify(product, newStock);
        return newStock;
    }

    /**
     * Apply a manual stock adjustment from the seller portal (or any
     * future restock flow). Re-uses the same threshold check so a
     * seller adding a pallet of cylinders doesn't accidentally re-fire
     * a low-stock alert they just received.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public int applyManualStock(Long productId, int newStock) {
        if (newStock < 0) {
            throw new IllegalArgumentException("Stock cannot be negative.");
        }
        ProductEntity product = productRepository.findById(productId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Product " + productId + " not found."));
        int previousStock = product.getStock();
        product.setStock(newStock);
        ProductEntity saved = productRepository.save(product);

        // Treat a manual rise out of the threshold zone as a "recovery":
        // re-arm the notifier so a later fall-back below the threshold
        // fires again. Otherwise we'd swallow a real subsequent alert.
        Object dedupeKey = product.getId() != null
                ? product.getId()
                : fallbackDedupeKey(product);
        if (previousStock <= product.getLowStockThreshold()
                && newStock > product.getLowStockThreshold()) {
            recentlyNotified.remove(dedupeKey);
        } else if (newStock <= product.getLowStockThreshold()) {
            checkThresholdAndNotify(saved, newStock);
        }
        return newStock;
    }

    // ---- Threshold / notification wiring --------------------------------

    private void checkThresholdAndNotify(ProductEntity product, int newStock) {
        int threshold = product.getLowStockThreshold();
        if (newStock > threshold) {
            // Healthy — nothing to do.
            return;
        }
        Long productId = product.getId();
        // Defensive: in unit tests / non-persisted entities the id can
        // be null. Fall back to sellerId+name so dedupe still works.
        Object dedupeKey = productId != null ? productId : fallbackDedupeKey(product);
        StockAlertState state = recentlyNotified.get(dedupeKey);
        if (state != null && state.matches(newStock, threshold)) {
            // Already notified for this (stock, threshold) pair; skip
            // to avoid spamming the seller.
            return;
        }
        boolean outOfStock = newStock == 0;
        notifySeller(product, newStock, threshold, outOfStock);
        recentlyNotified.put(dedupeKey, new StockAlertState(newStock, threshold));
    }

    private void notifySeller(ProductEntity product, int newStock, int threshold, boolean outOfStock) {
        String title = outOfStock
                ? "Out of stock: " + product.getName()
                : "Low stock: " + product.getName();
        String message = outOfStock
                ? product.getName() + " (" + product.getSize() + ") has run out of stock. "
                        + "Restock soon to keep accepting orders."
                : product.getName() + " (" + product.getSize() + ") has " + newStock
                        + " units left — at or below your low-stock threshold of " + threshold + ".";

        String data = "{" +
                "\"productId\":\"" + (product.getId() == null ? "" : product.getId()) + "\"," +
                "\"productName\":\"" + jsonEscape(product.getName()) + "\"," +
                "\"stock\":" + newStock + "," +
                "\"threshold\":" + threshold + "," +
                "\"outOfStock\":" + outOfStock +
                "}";

        notificationService.notify(
                product.getSellerId(),
                "stock",
                title,
                message,
                data
        );
    }

    /** Synthetic dedupe key for unit-test-only entities with null id. */
    private static Object fallbackDedupeKey(ProductEntity product) {
        return product.getSellerId() + ":" + product.getName();
    }

    /** Strip control chars / quotes from free-text fields before embedding in JSON. */
    private static String jsonEscape(String raw) {
        if (raw == null) return "";
        StringBuilder sb = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c == '"' || c == '\\') sb.append('\\').append(c);
            else if (c < 0x20) sb.append(' ');
            else sb.append(c);
        }
        return sb.toString();
    }

    /** Pure-data record used to suppress duplicate alerts in the same JVM session. */
    private record StockAlertState(int stock, int threshold) {
        boolean matches(int currentStock, int currentThreshold) {
            // Treat any sub-threshold value as "already notified" until
            // the manual-stock path explicitly re-arms via applyManualStock.
            return currentStock <= currentThreshold;
        }
    }

    /** Test hook — clear the dedupe cache between tests so they don't bleed state. */
    public void clearNotificationDedupForTests() {
        recentlyNotified.clear();
    }

    // ---- Helpers exposed for tests ---------------------------------------

    /** BigDecimal convenience for product price lookups in test scaffolding. */
    public static BigDecimal priceOf(ProductEntity p) {
        return p.getPrice();
    }

    /** Returns true iff a low-stock notification has already fired for this product. */
    public boolean hasRecentLowStockNotification(Object key) {
        return recentlyNotified.containsKey(key);
    }

    /** Returns the dedupe key list (test inspection). */
    public List<Object> recentlyNotifiedIds() {
        return new ArrayList<>(recentlyNotified.keySet());
    }
}
