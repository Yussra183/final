package com.project.gas_delivery.permit.repository;

import com.project.gas_delivery.permit.entity.SupplierApplicationEntity;
import com.project.gas_delivery.permit.enums.PermitStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SupplierApplicationRepository
        extends JpaRepository<SupplierApplicationEntity, Long> {

    Optional<SupplierApplicationEntity> findBySupplierId(Long supplierId);

    boolean existsBySupplierId(Long supplierId);

    /**
     * Admin review queue. Sorted by submission time (oldest first) so the
     * admin works through applications in the order they arrived.
     */
    @Query("""
            SELECT s FROM SupplierApplicationEntity s
             WHERE (:status IS NULL OR s.status = :status)
             ORDER BY COALESCE(s.submittedAt, s.createdAt) ASC
            """)
    List<SupplierApplicationEntity> findForReview(@Param("status") PermitStatus status);

    /**
     * Bulk membership check — returns the set of supplier ids whose
     * {@code supplier_applications.status = APPROVED}. Callers use this
     * to gate supplier business features behind admin approval.
     */
    @Query("SELECT s.supplierId FROM SupplierApplicationEntity s WHERE s.status = :status")
    List<Long> findSupplierIdsByStatus(@Param("status") PermitStatus status);

    /**
     * FR-06: full approved-supplier applications joined to their
     * supplier {@code users} records, newest approval first. Drives
     * {@code GET /api/suppliers/approved} so the seller's restock UI
     * can populate the supplier picker with currently-eligible names
     * (rather than letting the seller raise an order against a
     * supplier whose application is still PENDING).
     */
    @Query("""
            SELECT s FROM SupplierApplicationEntity s
             WHERE s.status = :status
             ORDER BY s.reviewedAt DESC
            """)
    List<SupplierApplicationEntity> findApprovedApplications(@Param("status") PermitStatus status);
}
