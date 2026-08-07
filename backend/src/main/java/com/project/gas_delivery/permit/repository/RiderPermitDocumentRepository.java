package com.project.gas_delivery.permit.repository;

import com.project.gas_delivery.permit.entity.RiderPermitDocumentEntity;
import com.project.gas_delivery.permit.enums.RiderPermitDocumentType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RiderPermitDocumentRepository
        extends JpaRepository<RiderPermitDocumentEntity, Long> {

    /** Documents belonging to one rider application, surfaced to the rider + admin. */
    List<RiderPermitDocumentEntity> findByRiderApplicationId(Long riderApplicationId);

    /** Used by the storage service to replace a prior row in the same slot. */
    Optional<RiderPermitDocumentEntity> findByRiderApplicationIdAndDocumentType(
            Long riderApplicationId, RiderPermitDocumentType documentType);
}