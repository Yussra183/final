package com.project.gas_delivery.supplier.repository;

import com.project.gas_delivery.supplier.entity.SupplierRiderEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Repository for {@link SupplierRiderEntity} (V19).
 *
 * <p>Backs {@code /api/supplier-riders} and the
 * {@code SupplierLogisticsService.requireOwnRider} ownership guard.
 * Membership checks return a derived {@code boolean} so the
 * supplier-rider validation stays in-process without an extra row read.</p>
 */
@Repository
public interface SupplierRiderRepository
        extends JpaRepository<SupplierRiderEntity, SupplierRiderEntity.PK> {

    /** Riders the supplier has explicitly assigned to their company. */
    List<SupplierRiderEntity> findBySupplierId(Long supplierId);

    /** Suppliers the rider is assigned to (audit / reverse-lookup). */
    List<SupplierRiderEntity> findByRiderId(Long riderId);

    /** Single-query fetch of every rider id belonging to the supplier. */
    @Query("SELECT sr.riderId FROM SupplierRiderEntity sr WHERE sr.supplierId = :supplierId")
    List<Long> findRiderIdsBySupplierId(@Param("supplierId") Long supplierId);

    /**
     * Membership check — {@code true} when the supplier has explicitly
     * added this rider to their company. Used by
     * {@code SupplierLogisticsService.requireOwnRider} so a supplier
     * cannot attach a foreign rider to a route by guessing an id.
     */
    boolean existsBySupplierIdAndRiderId(Long supplierId, Long riderId);
}
