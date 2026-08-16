package com.project.gas_delivery.product.repository;

import com.project.gas_delivery.product.entity.ProductEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface ProductRepository extends JpaRepository<ProductEntity, Long> {

    /** All active products for one seller — used by the customer's product list. */
    List<ProductEntity> findBySellerIdAndActiveTrueOrderByNameAsc(Long sellerId);

    /** Batch lookup of active products across many sellers — used by the
     *  seller-profile enrichment to compute the available-sizes set. */
    List<ProductEntity> findBySellerIdInAndActiveTrue(Collection<Long> sellerIds);

    // ---- Admin read surface -------------------------------------------

    /** Whole catalogue including inactive rows — the admin product list. */
    List<ProductEntity> findAllByOrderByNameAsc();

    /** Product count per seller for a page of sellers. Rows of [sellerId, count]. */
    @Query("""
            SELECT p.sellerId, COUNT(p)
              FROM ProductEntity p
             WHERE p.sellerId IN :sellerIds
             GROUP BY p.sellerId
            """)
    List<Object[]> countGroupedBySellerId(@Param("sellerIds") Collection<Long> sellerIds);

    // ---- FR-05 stock operations ----------------------------------------

    /**
     * Atomic conditional decrement used by the order flow. The {@code
     * WHERE stock >= :qty} predicate guarantees the update only succeeds
     * when there is enough inventory; rows updated == 1 means the
     * decrement applied, rows updated == 0 means another concurrent
     * transaction already reduced the stock below the requested
     * quantity and the caller MUST reject the order.
     *
     * <p>Postgres takes a row-level write lock for the duration of the
     * UPDATE, so two concurrent {@code reserveStock} calls on the same
     * product serialise on the same row and never oversell.</p>
     *
     * <p>The {@code updated_at} trigger from V3 keeps the timestamp
     * honest without us having to touch it in the JPQL.</p>
     */
    @Modifying
    @Query("""
            UPDATE ProductEntity p
               SET p.stock = p.stock - :qty
             WHERE p.id = :id
               AND p.active = TRUE
               AND p.stock >= :qty
            """)
    int reserveStock(@Param("id") Long productId, @Param("qty") int quantity);
}