package com.project.gas_delivery.order.repository;

import com.project.gas_delivery.order.entity.OrderEntity;
import com.project.gas_delivery.order.enums.OrderStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

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
}
