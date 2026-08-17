package com.project.gas_delivery.supply.repository;

import com.project.gas_delivery.supply.entity.SupplyOrderEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SupplyOrderRepository extends JpaRepository<SupplyOrderEntity, Long> {

    /** Seller's own history, newest-first. */
    List<SupplyOrderEntity> findBySellerIdOrderByUpdatedAtDesc(Long sellerId);

    /** Supplier's queue (all statuses), newest-first. */
    List<SupplyOrderEntity> findBySupplierIdOrderByUpdatedAtDesc(Long supplierId);

    /**
     * Open supply orders addressed to a specific supplier — the
     * supplier-side "available" queue used by the FR-06 REST endpoint.
     * Excludes any row already cancelled or rejected so the supplier
     * only sees actionable work.
     */
    @Query("""
            SELECT s FROM SupplyOrderEntity s
             WHERE s.supplierId = :supplierId
               AND s.status IN (
                   com.project.gas_delivery.supply.enums.SupplyOrderStatus.PENDING,
                   com.project.gas_delivery.supply.enums.SupplyOrderStatus.ACCEPTED,
                   com.project.gas_delivery.supply.enums.SupplyOrderStatus.PREPARING,
                   com.project.gas_delivery.supply.enums.SupplyOrderStatus.DISPATCHED
               )
             ORDER BY s.updatedAt DESC
            """)
    List<SupplyOrderEntity> findOpenForSupplier(@Param("supplierId") Long supplierId);

    /**
     * Open supply orders addressed to ANY supplier — the supplier's
     * "unclaimed" view. Used when a supplier wants to browse all
     * {@code PENDING} orders the system has not yet routed.
     */
    @Query("""
            SELECT s FROM SupplyOrderEntity s
             WHERE s.supplierId IS NULL
               AND s.status = com.project.gas_delivery.supply.enums.SupplyOrderStatus.PENDING
             ORDER BY s.createdAt DESC
            """)
    List<SupplyOrderEntity> findUnclaimedPending();
}
