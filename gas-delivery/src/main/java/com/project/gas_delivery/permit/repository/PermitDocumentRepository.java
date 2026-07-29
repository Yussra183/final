package com.project.gas_delivery.permit.repository;

import com.project.gas_delivery.permit.entity.PermitDocumentEntity;
import com.project.gas_delivery.permit.enums.PermitDocumentType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PermitDocumentRepository extends JpaRepository<PermitDocumentEntity, Long> {

    List<PermitDocumentEntity> findByPermitId(Long permitId);

    Optional<PermitDocumentEntity> findByPermitIdAndDocumentType(
            Long permitId, PermitDocumentType documentType);

    long countByPermitId(Long permitId);
}
