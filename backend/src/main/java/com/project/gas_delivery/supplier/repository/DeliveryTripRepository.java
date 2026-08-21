package com.project.gas_delivery.supplier.repository;

import com.project.gas_delivery.supplier.entity.DeliveryTripEntity;
import com.project.gas_delivery.supplier.enums.DeliveryTripStatus;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
