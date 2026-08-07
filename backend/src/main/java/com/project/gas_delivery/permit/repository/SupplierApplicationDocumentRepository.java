package com.project.gas_delivery.permit.repository;

import com.project.gas_delivery.permit.entity.SupplierApplicationDocumentEntity;
import com.project.gas_delivery.permit.enums.SupplierApplicationDocumentType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SupplierApplicationDocumentRepository
        extends JpaRepository<SupplierApplicationDocumentEntity, Long> {

    List<SupplierApplicationDocumentEntity> findBySupplierApplicationId(Long supplierApplicationId);

    Optional<SupplierApplicationDocumentEntity> findBySupplierApplicationIdAndDocumentType(
            Long supplierApplicationId, SupplierApplicationDocumentType documentType);
}
