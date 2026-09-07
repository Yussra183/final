package com.project.gas_delivery.supplier.repository;

import com.project.gas_delivery.supplier.entity.DeliveryTripEntity;
import com.project.gas_delivery.supplier.enums.DeliveryTripStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DeliveryTripRepository extends JpaRepository<DeliveryTripEntity, Long> {

    List<DeliveryTripEntity> findBySupplierIdOrderByCreatedAtDesc(Long supplierId);

    List<DeliveryTripEntity> findBySupplierIdAndStatusOrderByCreatedAtDesc(
            Long supplierId, DeliveryTripStatus status);

    /**
     * The one non-terminal trip on a route, if any. Backs the
     * "you already have a delivery running on this route" guard; the
     * partial unique index in V18 is the hard backstop.
     */
    Optional<DeliveryTripEntity> findFirstByRouteIdAndStatus(
            Long routeId, DeliveryTripStatus status);

    List<DeliveryTripEntity> findByRouteIdOrderByCreatedAtDesc(Long routeId);

    // ---- Admin write surface (user-deletion active-operations guard) --

    /**
     * Count of non-terminal delivery trips owned by the given supplier
     * (they issued the trip). A supplier cannot be deactivated /
     * hard-deleted while a delivery they dispatched is still on the
     * road. Non-terminal = every {@link DeliveryTripStatus} except
     * COMPLETED and CANCELLED.
     */
    @Query("""
            SELECT COUNT(t) FROM DeliveryTripEntity t
             WHERE t.supplierId = :supplierId
               AND t.status NOT IN (
                   com.project.gas_delivery.supplier.enums.DeliveryTripStatus.COMPLETED,
                   com.project.gas_delivery.supplier.enums.DeliveryTripStatus.CANCELLED)
            """)
    long countActiveBySupplierId(@Param("supplierId") Long supplierId);

    /**
     * Count of non-terminal delivery trips assigned to the given rider
     * (Rider app currently doesn't reference this entity directly, but
     * V9 / V22 audit recommended keeping the contract for the rider
     * table consistent with the supplier one). Defined here so the
     * admin-write service has a single, symmetric API to call.
     */
    @Query("""
            SELECT COUNT(t) FROM DeliveryTripEntity t
             WHERE t.riderId = :riderId
               AND t.status NOT IN (
                   com.project.gas_delivery.supplier.enums.DeliveryTripStatus.COMPLETED,
                   com.project.gas_delivery.supplier.enums.DeliveryTripStatus.CANCELLED)
            """)
    long countActiveByRiderId(@Param("riderId") Long riderId);
}
