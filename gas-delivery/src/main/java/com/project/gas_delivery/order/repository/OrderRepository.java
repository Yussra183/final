package com.project.gas_delivery.order.repository;

import com.project.gas_delivery.order.entity.OrderEntity;
import com.project.gas_delivery.order.enums.OrderStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;

/**
 * Spring Data JPA repository for {@link OrderEntity}.
 *
 * <p>The {@code claimAtomic} native query is intentionally absent — it
 * lives in {@code OrderServiceImpl} because the {@code RETURNING *} clause
 * requires a typed mapping that the repository contract doesn't expose
 * cleanly.</p>
 */
@Repository
public interface OrderRepository extends JpaRepository<OrderEntity, Long> {

    List<OrderEntity> findByCustomerIdOrderByUpdatedAtDesc(Long customerId);

    List<OrderEntity> findBySellerIdOrderByUpdatedAtDesc(Long sellerId);

    /**
     * Orders whose seller is any of the given ids (i.e. sellers the
     * caller is assigned to via {@code seller_riders}), newest first.
     * Used by the rider dashboard to scope {@code GET /api/orders}
     * to the rider's assigned sellers; the existing
     * {@code idx_orders_seller} covers the sort.
     */
    List<OrderEntity> findBySellerIdInOrderByUpdatedAtDesc(Collection<Long> sellerIds);

    List<OrderEntity> findByRiderIdOrderByUpdatedAtDesc(Long riderId);

    /**
     * Dispatch queue: orders in {@code accepted} status with no rider
     * assigned yet, sorted newest-first. The partial index
     * {@code idx_orders_dispatch_queue} covers this lookup.
     */
    @Query("""
            SELECT o FROM OrderEntity o
            WHERE o.status = com.project.gas_delivery.order.enums.OrderStatus.ACCEPTED
              AND o.riderId IS NULL
            ORDER BY o.updatedAt DESC
            """)
    List<OrderEntity> findAvailableForDispatch();

    // ---- Admin read surface -------------------------------------------
    // Aggregations backing the admin dashboard, directory and report
    // screens. Every per-page lookup below is a single GROUP BY over a
    // collected id set rather than one query per row.

    /** Whole table, newest first — the admin order list. */
    List<OrderEntity> findAllByOrderByUpdatedAtDesc();

    /** Order count per status in one round trip: rows of [status, count]. */
    @Query("SELECT o.status, COUNT(o) FROM OrderEntity o GROUP BY o.status")
    List<Object[]> countGroupedByStatus();

    /** Realised revenue — summed over one status (DELIVERED at the call site). */
    @Query("SELECT COALESCE(SUM(o.total), 0) FROM OrderEntity o WHERE o.status = :status")
    BigDecimal sumTotalByStatus(@Param("status") OrderStatus status);

    /**
     * Per-customer order count and lifetime spend for a page of customers.
     * Rows of [customerId, count, sumTotal].
     */
    @Query("""
            SELECT o.customerId, COUNT(o), COALESCE(SUM(o.total), 0)
              FROM OrderEntity o
             WHERE o.customerId IN :ids
             GROUP BY o.customerId
            """)
    List<Object[]> aggregateCustomerTotals(@Param("ids") Collection<Long> ids);

    /**
     * Per-rider order count broken down by status, for a page of riders.
     * Rows of [riderId, status, count]. The caller folds in-flight
     * statuses into "assigned" and DELIVERED into "completed".
     */
    @Query("""
            SELECT o.riderId, o.status, COUNT(o)
              FROM OrderEntity o
             WHERE o.riderId IN :ids
             GROUP BY o.riderId, o.status
            """)
    List<Object[]> aggregateRiderStatusCounts(@Param("ids") Collection<Long> ids);

    /** Daily order count and revenue over a window. Rows of [date, count, sumTotal]. */
    @Query("""
            SELECT FUNCTION('DATE', o.createdAt), COUNT(o), COALESCE(SUM(o.total), 0)
              FROM OrderEntity o
             WHERE o.createdAt BETWEEN :from AND :to
             GROUP BY FUNCTION('DATE', o.createdAt)
             ORDER BY FUNCTION('DATE', o.createdAt) ASC
            """)
    List<Object[]> aggregateDaily(@Param("from") Instant from, @Param("to") Instant to);

    /**
     * Highest-earning sellers over a window, delivered orders only.
     * Rows of [sellerId, count, sumTotal]. Bound with a
     * {@code PageRequest.of(0, limit)} at the call site.
     *
     * <p>Grouped by id alone, not by {@code sellerName}: the name is
     * denormalised onto each order at creation time, so a seller who
     * has renamed their business carries several historical spellings
     * and grouping on the name would split them into separate rows.
     * The caller resolves the current name from {@code users}.</p>
     */
    @Query("""
            SELECT o.sellerId, COUNT(o), COALESCE(SUM(o.total), 0)
              FROM OrderEntity o
             WHERE o.createdAt BETWEEN :from AND :to
               AND o.status = com.project.gas_delivery.order.enums.OrderStatus.DELIVERED
             GROUP BY o.sellerId
             ORDER BY COALESCE(SUM(o.total), 0) DESC
            """)
    List<Object[]> aggregateTopSellers(@Param("from") Instant from,
                                       @Param("to") Instant to,
                                       Pageable pageable);

    /** Status counts over a window — backs the report summary. */
    @Query("""
            SELECT o.status, COUNT(o), COALESCE(SUM(o.total), 0)
              FROM OrderEntity o
             WHERE o.createdAt BETWEEN :from AND :to
             GROUP BY o.status
            """)
    List<Object[]> aggregateStatusTotalsBetween(@Param("from") Instant from,
                                                @Param("to") Instant to);

    /** The most recent orders for one customer — the customer detail panel. */
    List<OrderEntity> findTop10ByCustomerIdOrderByUpdatedAtDesc(Long customerId);

    /** The most recent orders for one rider — the rider detail panel. */
    List<OrderEntity> findTop10ByRiderIdOrderByUpdatedAtDesc(Long riderId);

    /** Orders placed against one seller — used for the seller detail panel. */
    long countBySellerId(Long sellerId);
}
