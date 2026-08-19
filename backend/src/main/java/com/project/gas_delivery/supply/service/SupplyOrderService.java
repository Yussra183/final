package com.project.gas_delivery.supply.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.notification.service.NotificationService;
import com.project.gas_delivery.permit.service.SupplierApplicationService;
import com.project.gas_delivery.product.GasCatalog;
import com.project.gas_delivery.product.service.StockService;
import com.project.gas_delivery.supply.dto.CreateSupplyOrderRequest;
import com.project.gas_delivery.supply.dto.SupplyOrderDto;
import com.project.gas_delivery.supply.dto.UpdateSupplyOrderStatusRequest;
import com.project.gas_delivery.supply.entity.SupplyOrderEntity;
import com.project.gas_delivery.supply.enums.SupplyOrderStatus;
import com.project.gas_delivery.supply.exception.SupplyOrderException;
import com.project.gas_delivery.supply.repository.SupplyOrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * FR-06 — Gas Supply Management.
 *
 * <p>Single funnel for every gas-supply order lifecycle event:</p>
 * <ol>
 *   <li>Seller raises a {@code POST /api/restock} — a new {@link SupplyOrderEntity}
 *       lands in {@code PENDING}, addressed to a specific supplier or to
 *       the open pool.</li>
 *   <li>Supplier works the queue — accepts, rejects, marks preparing /
 *       dispatched / delivered.</li>
 *   <li>Seller confirms receipt — the seller's matching product
 *       {@code stock} is replenished via {@link StockService#applyManualStock}
 *       and the row goes terminal {@code RECEIVED}.</li>
 * </ol>
 *
 * <p>Notifications are pushed through the existing
 * {@link NotificationService} so each actor sees lifecycle events in their
 * single in-app feed.</p>
 *
 * <h2>Authorization</h2>
 * <ul>
 *   <li>Seller actions (raise, cancel before dispatch, receive) verify the
 *       {@code sellerId} on the row matches the caller.</li>
 *   <li>Supplier actions (accept/reject/prepare/dispatch/deliver) verify
 *       the row's {@code supplierId} matches the caller OR the row was
 *       unclaimed and the caller is grabbing it from the open pool.</li>
 *   <li>Supplier actions additionally gate on
 *       {@link SupplierApplicationService#isApproved(Long)} so unapproved
 *       suppliers cannot operate supply orders.</li>
 * </ul>
 *
 * <h2>Concurrency</h2>
 * <p>{@code updateStatus} runs inside a single transaction so the
 * state-machine UPDATE, the timestamp writes, and the stock increment
 * (on {@code RECEIVED}) all commit atomically. Two concurrent
 * {@code RECEIVED} clicks from the same seller will not double-credit
 * stock — the second sees {@code status = RECEIVED} and the call is
 * rejected as a duplicate transition.</p>
 */
@Service
public class SupplyOrderService {

    private static final Logger log = LoggerFactory.getLogger(SupplyOrderService.class);

    /** Statuses any actor may freely cancel. */
    private static final Set<SupplyOrderStatus> CANCELLABLE_STATUSES = EnumSet.of(
            SupplyOrderStatus.PENDING,
            SupplyOrderStatus.ACCEPTED,
            SupplyOrderStatus.PREPARING,
            SupplyOrderStatus.DISPATCHED
    );

    private final SupplyOrderRepository repository;
    private final SupplierApplicationService supplierApplicationService;
    private final StockService stockService;
    private final NotificationService notificationService;
    private final UserRepository userRepository;

    /**
     * Cache: (supply-order id, target status) pairs we already fired a
     * notification for in this JVM session. Same dedupe shape as
     * {@link StockService#recentlyNotified} — guards against duplicate
     * notifications if Spring replays the same transaction on retry.
     *
     * <p>Keyed on the <em>target status</em>, not just the order id,
     * so that a row progressing through ACCEPTED → PREPARING →
     * DISPATCHED → DELIVERED fires a fresh notification on every step
     * (the previous implementation only fired once per row, swallowing
     * every subsequent status change).</p>
     */
    private final Map<String, Boolean> recentlyNotifiedSupplyOrders = new LinkedHashMap<>();

    public SupplyOrderService(SupplyOrderRepository repository,
                              SupplierApplicationService supplierApplicationService,
                              StockService stockService,
                              NotificationService notificationService,
                              UserRepository userRepository) {
        this.repository = repository;
        this.supplierApplicationService = supplierApplicationService;
        this.stockService = stockService;
        this.notificationService = notificationService;
        this.userRepository = userRepository;
    }

    // =====================================================================
    // Listing
    // =====================================================================

    /** List every supply order in the system (admin surface). */
    @Transactional(readOnly = true)
    public List<SupplyOrderDto> listAll() {
        return repository.findAll().stream().map(SupplyOrderDto::from).toList();
    }

    /** Seller's own history (newest-first). */
    @Transactional(readOnly = true)
    public List<SupplyOrderDto> listForSeller(Long sellerId) {
        return repository.findBySellerIdOrderByUpdatedAtDesc(sellerId).stream()
                .map(SupplyOrderDto::from).toList();
    }

    /** Supplier's open queue (PENDING + ACCEPTED + PREPARING + DISPATCHED). */
    @Transactional(readOnly = true)
    public List<SupplyOrderDto> listForSupplier(Long supplierId) {
        return repository.findOpenForSupplier(supplierId).stream()
                .map(SupplyOrderDto::from).toList();
    }

    /** Open pool: every {@code PENDING} order with no supplier assigned. */
    @Transactional(readOnly = true)
    public List<SupplyOrderDto> listUnclaimed() {
        return repository.findUnclaimedPending().stream()
                .map(SupplyOrderDto::from).toList();
    }

    @Transactional(readOnly = true)
    public SupplyOrderDto getById(Long id, Role actorRole, Long actorId) {
        SupplyOrderEntity row = requireOwned(id, actorRole, actorId);
        return SupplyOrderDto.from(row);
    }

    // =====================================================================
    // Create
    // =====================================================================

    /**
     * Seller raises a new supply order. The supplier must already be
     * approved if the seller picked one. We snapshot the supplier's
     * display name so the supplier side never needs to re-resolve it on
     * every render.
     */
    @Transactional
    public SupplyOrderDto create(Long sellerId, Role actorRole, CreateSupplyOrderRequest req) {
        if (actorRole != Role.SELLER) {
            throw new SupplyOrderException(SupplyOrderException.Kind.FORBIDDEN,
                    "Only sellers can raise supply orders.");
        }
        // FR-06: validate the gas brand / size against the canonical
        // GasCatalog. The seller is never allowed to request a brand +
        // size combination the supplier can't fulfil (e.g. "Oryx Gas
        // 15kg"). The check rejects every non-canonical combination,
        // including legacy / unrecognised brands like a bare "LPG".
        validateGasCombination(req.getProductName(), req.getSize());

        if (req.getSupplierId() != null) {
            User supplier = userRepository.findById(req.getSupplierId())
                    .orElseThrow(() -> new SupplyOrderException(
                            SupplyOrderException.Kind.NOT_FOUND,
                            "Supplier " + req.getSupplierId() + " not found."));
            if (supplier.getRole() != Role.SUPPLIER) {
                throw new SupplyOrderException(SupplyOrderException.Kind.NOT_FOUND,
                        "User " + req.getSupplierId() + " is not a supplier.");
            }
            if (!supplierApplicationService.isApproved(supplier.getId())) {
                throw new SupplyOrderException(
                        SupplyOrderException.Kind.SUPPLIER_NOT_APPROVED,
                        "Supplier is not yet approved to take supply orders.");
            }
            req.setSupplierName(supplier.getFullName());
        }

        User seller = userRepository.findById(sellerId)
                .orElseThrow(() -> new SupplyOrderException(
                        SupplyOrderException.Kind.NOT_FOUND,
                        "Seller " + sellerId + " not found."));

        SupplyOrderEntity entity = new SupplyOrderEntity(
                seller.getId(),
                seller.getFullName(),
                req.getSupplierId(),
                req.getSupplierName(),
                req.getProductName().trim(),
                req.getSize().trim(),
                req.getQuantity(),
                req.getProductId(),
                req.getNotes() == null ? null : req.getNotes().trim()
        );
        SupplyOrderEntity saved = repository.save(entity);

        // Notify the addressed supplier (if any) so they see a new order
        // in their feed without having to refresh.
        if (saved.getSupplierId() != null) {
            notificationService.notify(
                    saved.getSupplierId(),
                    "supply",
                    "New supply order from " + saved.getSellerName(),
                    saved.getSellerName() + " requested "
                            + saved.getQuantity() + " × " + saved.getProductName()
                            + " (" + saved.getSize() + ").",
                    json(Map.of(
                            "supplyOrderId", String.valueOf(saved.getId()),
                            "sellerId", String.valueOf(saved.getSellerId()),
                            "status", "pending",
                            "kind", "new_order"
                    ))
            );
            markNotified(saved.getId(), SupplyOrderStatus.PENDING);
        }
        return SupplyOrderDto.from(saved);
    }

    // =====================================================================
    // State-machine transitions
    // =====================================================================

    /**
     * Apply a {@link UpdateSupplyOrderStatusRequest} from either side.
     * All role / ownership / state-machine rules live here.
     */
    @Transactional
    public SupplyOrderDto updateStatus(Long id, Role actorRole, Long actorId,
                                       UpdateSupplyOrderStatusRequest req) {
        SupplyOrderEntity row = requireOwned(id, actorRole, actorId);
        SupplyOrderStatus from = row.getStatus();
        SupplyOrderStatus to = req.getStatus();
        if (from == to) {
            return SupplyOrderDto.from(row);  // idempotent no-op
        }
        if (from.isTerminal()) {
            throw new SupplyOrderException(SupplyOrderException.Kind.ILLEGAL_TRANSITION,
                    "Supply order " + id + " is already terminal (" + from + ").");
        }
        validateTransition(from, to, req.getReason(), actorRole, actorId);

        row.setStatus(to);
        Instant now = Instant.now();
        switch (to) {
            case ACCEPTED -> {
                // If the row was unclaimed (no supplierId), this is a
                // supplier grabbing it from the open pool.
                if (row.getSupplierId() == null) {
                    User supplier = userRepository.findById(actorId).orElse(null);
                    row.setSupplierId(actorId);
                    row.setSupplierName(supplier == null ? null : supplier.getFullName());
                }
            }
            case REJECTED -> row.setRejectReason(req.getReason());
            case DISPATCHED -> row.setDispatchedAt(now);
            // Per the supplied business diagram (Block 7), the SELLER
            // — not the supplier — confirms receipt and triggers the
            // DELIVERED transition. The supplier only stages up to
            // DISPATCHED; once the gas reaches the seller, the seller
            // taps "Confirm receipt" → DELIVERED, and that single
            // transition atomically timestamps `deliveredAt` and
            // credits the inventory.
            case DELIVERED  -> {
                row.setDeliveredAt(now);
                row.setReceivedAt(now);
            }
            case CANCELLED  -> {
                row.setCancelledAt(now);
                row.setCancelledByRole(
                        actorRole == Role.SELLER ? "SELLER"
                                : actorRole == Role.SUPPLIER ? "SUPPLIER"
                                : "ADMIN");
            }
            default -> { /* PENDING, PREPARING — no timestamp stamp */ }
        }
        SupplyOrderEntity saved = repository.save(row);

        // DELIVERED (set by the seller on receipt confirmation) is the
        // single transition that mutates the seller's inventory. Routing
        // through StockService.replenishForSupplyReceipt re-uses the same
        // threshold-check + low-stock notification machinery the manual
        // stock-adjust path already uses, so restocking out of a low-
        // stock state naturally re-arms the threshold alert for the
        // next dip.
        if (to == SupplyOrderStatus.DELIVERED) {
            applyReplenishment(saved);
        }
        fireStatusNotifications(saved, from, to);
        return SupplyOrderDto.from(saved);
    }

    // =====================================================================
    // helpers — ownership, transition rules, side effects
    // =====================================================================

    /**
     * Load the row and verify the actor can read it. Mirrors the same
     * pattern used in {@code OrderServiceImpl} for orders and riders.
     */
    private SupplyOrderEntity requireOwned(Long id, Role actorRole, Long actorId) {
        SupplyOrderEntity row = repository.findById(id)
                .orElseThrow(() -> new SupplyOrderException(
                        SupplyOrderException.Kind.NOT_FOUND,
                        "Supply order " + id + " not found."));
        boolean isAdmin = actorRole == Role.ADMIN;
        boolean isOwningSeller = actorRole == Role.SELLER
                && row.getSellerId() != null
                && row.getSellerId().equals(actorId);
        boolean isOwningSupplier = actorRole == Role.SUPPLIER
                && row.getSupplierId() != null
                && row.getSupplierId().equals(actorId);
        boolean isUnclaimedSupplier = actorRole == Role.SUPPLIER
                && row.getSupplierId() == null;
        if (!(isAdmin || isOwningSeller || isOwningSupplier || isUnclaimedSupplier)) {
            throw new SupplyOrderException(SupplyOrderException.Kind.FORBIDDEN,
                    "You are not allowed to access this supply order.");
        }
        return row;
    }

    /**
     * Decide whether {@code from → to} is a legal transition for the
     * given actor and require a reason when one is needed.
     *
     * <p>Per-actor rules (aligned to the supplied business diagram,
     * Block 7):</p>
     * <ul>
     *   <li>SELLER may: cancel (PENDING/ACCEPTED/PREPARING/DISPATCHED),
     *       mark DELIVERED on receipt (DISPATCHED only) — this single
     *       transition timestamps `deliveredAt` and credits inventory.</li>
     *   <li>SUPPLIER may: accept (PENDING or unclaimed), reject
     *       (PENDING only), start preparing (ACCEPTED), dispatch
     *       (ACCEPTED or PREPARING), cancel
     *       (PENDING/ACCEPTED/PREPARING/DISPATCHED). The supplier does
     *       NOT set DELIVERED — only the seller does, on receipt.</li>
     *   <li>ADMIN may cancel from any non-terminal state (escape hatch).</li>
     * </ul>
     */
    private void validateTransition(SupplyOrderStatus from, SupplyOrderStatus to,
                                    String reason, Role actorRole, Long actorId) {
        boolean legal = switch (to) {
            case ACCEPTED   -> (actorRole == Role.SUPPLIER)
                    && (from == SupplyOrderStatus.PENDING);
            case PREPARING  -> (actorRole == Role.SUPPLIER)
                    && (from == SupplyOrderStatus.ACCEPTED);
            case DISPATCHED -> (actorRole == Role.SUPPLIER)
                    && (from == SupplyOrderStatus.ACCEPTED
                        || from == SupplyOrderStatus.PREPARING);
            case DELIVERED  -> (actorRole == Role.SELLER)
                    && (from == SupplyOrderStatus.DISPATCHED);
            // RECEIVED is kept for backwards compatibility with rows
            // written before the diagram-aligned change; new flows
            // land directly on DELIVERED. Suppliers cannot reach it,
            // and no admin path writes it either.
            case RECEIVED   -> (actorRole == Role.SELLER)
                    && (from == SupplyOrderStatus.DISPATCHED)
                    && !Boolean.TRUE;  // disabled — DELIVERED is canonical
            case REJECTED   -> (actorRole == Role.SUPPLIER)
                    && (from == SupplyOrderStatus.PENDING);
            case CANCELLED  -> CANCELLABLE_STATUSES.contains(from)
                    && (actorRole == Role.SELLER
                        || actorRole == Role.SUPPLIER
                        || actorRole == Role.ADMIN);
            default -> false;
        };
        if (!legal) {
            throw new SupplyOrderException(SupplyOrderException.Kind.ILLEGAL_TRANSITION,
                    "Illegal supply-order transition: " + from + " → " + to
                            + " for role " + actorRole + ".");
        }
        if ((to == SupplyOrderStatus.REJECTED || to == SupplyOrderStatus.CANCELLED)
                && (reason == null || reason.trim().isEmpty())) {
            throw new SupplyOrderException(SupplyOrderException.Kind.REASON_REQUIRED,
                    "A reason is required to " + to.toJson() + " a supply order.");
        }
        if (actorRole == Role.SUPPLIER
                && (to == SupplyOrderStatus.ACCEPTED
                    || to == SupplyOrderStatus.REJECTED
                    || to == SupplyOrderStatus.PREPARING
                    || to == SupplyOrderStatus.DISPATCHED
                    || to == SupplyOrderStatus.DELIVERED)
                && !supplierApplicationService.isApproved(actorId)) {
            throw new SupplyOrderException(SupplyOrderException.Kind.SUPPLIER_NOT_APPROVED,
                    "Your supplier account is not approved to operate supply orders.");
        }
    }

    /**
     * Replenish the matching product's stock when the seller RECEIVED
     * the supply. Skips silently when {@code product_id} is null
     * (generic refill the supplier fulfilled from their own brand).
     *
     * <p>Routing through {@link StockService#replenishForSupplyReceipt}
     * gives us an atomic single-UPDATE increment + the same
     * threshold-rearm logic the manual-stock path already uses.</p>
     */
    private void applyReplenishment(SupplyOrderEntity row) {
        if (row.getProductId() == null) {
            log.info("Supply order {} received without a product_id; skipping stock replenishment.",
                    row.getId());
            return;
        }
        int newStock = stockService.replenishForSupplyReceipt(row.getProductId(), row.getQuantity());
        log.info("Supply order {} receipt replenished product {} by {} (new stock = {}).",
                row.getId(), row.getProductId(), row.getQuantity(), newStock);
    }

    /**
     * Fan out a notification for every interesting status change.
     *
     * <p>Per the diagram:</p>
     * <ul>
     *   <li>Supplier-driven transitions (ACCEPTED, PREPARING,
     *       DISPATCHED, REJECTED, CANCELLED-by-supplier) notify the
     *       <em>seller</em>.</li>
     *   <li>Seller-driven transitions (DELIVERED, CANCELLED-by-seller)
     *       notify the <em>supplier</em>.</li>
     * </ul>
     *
     * <p>The dedupe cache (keyed on {@code (orderId, targetStatus)})
     * stops Spring's transaction retry from doubling up.</p>
     */
    private void fireStatusNotifications(SupplyOrderEntity row,
                                         SupplyOrderStatus from,
                                         SupplyOrderStatus to) {
        if (alreadyNotified(row.getId(), to)) return;
        Long sellerId = row.getSellerId();
        Long supplierId = row.getSupplierId();
        String product = row.getProductName() + " (" + row.getSize() + ")";
        String qty = row.getQuantity() + " × ";

        switch (to) {
            case ACCEPTED -> notificationService.notify(
                    sellerId, "supply",
                    "Supply order accepted",
                    "Your supplier accepted the request for " + qty + product + ".",
                    json(Map.of(
                            "supplyOrderId", String.valueOf(row.getId()),
                            "status", "accepted", "kind", "status_change"
                    )));
            case PREPARING -> notificationService.notify(
                    sellerId, "supply",
                    "Supply order is being prepared",
                    "Your supplier is preparing " + qty + product + ".",
                    json(Map.of(
                            "supplyOrderId", String.valueOf(row.getId()),
                            "status", "preparing", "kind", "status_change"
                    )));
            case DISPATCHED -> notificationService.notify(
                    sellerId, "supply",
                    "Supply order dispatched",
                    "Your supply of " + qty + product + " is on the way.",
                    json(Map.of(
                            "supplyOrderId", String.valueOf(row.getId()),
                            "status", "dispatched", "kind", "status_change"
                    )));
            // DELIVERED is the seller's own confirmation: the seller
            // just acknowledged receipt, so we notify the SUPPLIER
            // (the seller doesn't need a self-notification). The
            // title is "Supply order received" so the supplier's
            // existing notification feed continues to recognise the
            // event.
            case DELIVERED -> {
                if (supplierId != null) {
                    notificationService.notify(
                            supplierId, "supply",
                            "Supply order received",
                            row.getSellerName() + " confirmed receipt of "
                                    + qty + product
                                    + ". Your restock is now closed.",
                            json(Map.of(
                                    "supplyOrderId", String.valueOf(row.getId()),
                                    "status", "delivered", "kind", "status_change"
                            )));
                }
            }
            // RECEIVED is kept for backwards compatibility with rows
            // written before the diagram-aligned change. New code
            // does not transition into RECEIVED.
            case RECEIVED -> {
                if (supplierId != null) {
                    notificationService.notify(
                            supplierId, "supply",
                            "Supply order received",
                            row.getSellerName() + " confirmed receipt of " + qty + product + ".",
                            json(Map.of(
                                    "supplyOrderId", String.valueOf(row.getId()),
                                    "status", "received", "kind", "status_change"
                            )));
                }
            }
            case REJECTED -> notificationService.notify(
                    sellerId, "supply",
                    "Supply order rejected",
                    "Your supplier declined the request for " + qty + product
                            + ". Reason: " + nullSafe(row.getRejectReason()) + ".",
                    json(Map.of(
                            "supplyOrderId", String.valueOf(row.getId()),
                            "status", "rejected", "reason", nullSafe(row.getRejectReason()),
                            "kind", "status_change"
                    )));
            case CANCELLED -> {
                String canceller = nullSafe(row.getCancelledByRole());
                if ("SELLER".equals(canceller) && supplierId != null) {
                    notificationService.notify(
                            supplierId, "supply",
                            "Supply order cancelled by seller",
                            row.getSellerName() + " cancelled their request for "
                                    + qty + product + ".",
                            json(Map.of(
                                    "supplyOrderId", String.valueOf(row.getId()),
                                    "status", "cancelled", "kind", "status_change"
                            )));
                } else if ("SUPPLIER".equals(canceller)) {
                    notificationService.notify(
                            sellerId, "supply",
                            "Supply order cancelled by supplier",
                            "Your supplier cancelled the request for " + qty + product + ".",
                            json(Map.of(
                                    "supplyOrderId", String.valueOf(row.getId()),
                                    "status", "cancelled", "kind", "status_change"
                            )));
                }
            }
            default -> { /* PENDING has no notification */ }
        }
        markNotified(row.getId(), to);
    }

    private boolean alreadyNotified(Long id, SupplyOrderStatus status) {
        return recentlyNotifiedSupplyOrders.containsKey(notifKey(id, status));
    }

    private void markNotified(Long id, SupplyOrderStatus status) {
        recentlyNotifiedSupplyOrders.put(notifKey(id, status), Boolean.TRUE);
    }

    private static String notifKey(Long id, SupplyOrderStatus status) {
        return id + ":" + (status == null ? "null" : status.name());
    }

    /** Test hook — clear dedupe cache between unit tests. */
    public void clearNotificationDedupForTests() {
        recentlyNotifiedSupplyOrders.clear();
    }

    /**
     * Reject any non-canonical gas brand / size combination. The
     * {@link GasCatalog} is the source of truth for which brands the
     * supplier can fulfil, and which sizes each brand has — anything
     * else is silently dropped at the supplier end, so we want to fail
     * loudly at create-time so the seller sees a meaningful error
     * rather than a row that goes nowhere.
     *
     * <p>Examples rejected by this guard:
     * <ul>
     *   <li>{@code "Oryx Gas" + "15 kg"} — Oryx has no 15 kg cylinder.</li>
     *   <li>{@code "LPG" + "13kg"} — bare LPG is not a supported brand.</li>
     *   <li>{@code "Unknown Gas" + "6 kg"} — unknown brand.</li>
     * </ul>
     */
    private void validateGasCombination(String productName, String size) {
        String brand = productName == null ? "" : productName.trim();
        String sizeNorm = size == null ? "" : size.trim();
        if (!GasCatalog.isSupportedBrand(brand)) {
            throw new SupplyOrderException(
                    SupplyOrderException.Kind.INVALID_GAS_COMBINATION,
                    "Unsupported gas brand: '" + brand + "'. "
                            + "Supported brands are Oryx Gas, Taifa Gas, "
                            + "Lake Gas, Manjis Gas, Mihan Gas."
            );
        }
        if (!GasCatalog.isSupportedSize(brand, sizeNorm)) {
            throw new SupplyOrderException(
                    SupplyOrderException.Kind.INVALID_GAS_COMBINATION,
                    "'" + brand + "' is not available in size '" + sizeNorm + "'. "
                            + "Supported sizes for " + brand + ": "
                            + String.join(", ", GasCatalog.supportedSizes(brand)) + "."
            );
        }
    }

    private static String nullSafe(String value) {
        return value == null ? "" : value;
    }

    /** Hand-rolled JSON object literal — matches SupplierApplicationService. */
    private static String json(Map<String, String> payload) {
        if (payload == null || payload.isEmpty()) return "{}";
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> entry : payload.entrySet()) {
            if (!first) sb.append(',');
            sb.append('"').append(escapeJson(entry.getKey())).append("\":\"");
            sb.append(escapeJson(entry.getValue())).append('"');
            first = false;
        }
        sb.append('}');
        return sb.toString();
    }

    private static String escapeJson(String raw) {
        if (raw == null) return "";
        StringBuilder sb = new StringBuilder(raw.length() + 8);
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            switch (c) {
                case '\\':
                case '"':
                    sb.append('\\').append(c);
                    break;
                case '\n':
                    sb.append("\\n");
                    break;
                case '\r':
                    sb.append("\\r");
                    break;
                case '\t':
                    sb.append("\\t");
                    break;
                default:
                    sb.append(c);
            }
        }
        return sb.toString();
    }
}
