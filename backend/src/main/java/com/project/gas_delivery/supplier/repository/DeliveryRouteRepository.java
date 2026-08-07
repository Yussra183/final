package com.project.gas_delivery.supplier.repository;

import com.project.gas_delivery.supplier.entity.DeliveryRouteEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DeliveryRouteRepository extends JpaRepository<DeliveryRouteEntity, Long> {
    List<DeliveryRouteEntity> findBySupplierIdOrderByScheduleDayAscScheduleTimeAsc(Long supplierId);
    List<DeliveryRouteEntity> findBySupplierIdAndActiveOrderByScheduleDayAscScheduleTimeAsc(Long supplierId, boolean active);
}