package com.project.gas_delivery.supplier.repository;

import com.project.gas_delivery.supplier.entity.SupplierVehicleEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SupplierVehicleRepository extends JpaRepository<SupplierVehicleEntity, Long> {
    List<SupplierVehicleEntity> findBySupplierIdOrderByCreatedAtAsc(Long supplierId);
    List<SupplierVehicleEntity> findBySupplierIdAndActiveOrderByCreatedAtAsc(Long supplierId, boolean active);
}