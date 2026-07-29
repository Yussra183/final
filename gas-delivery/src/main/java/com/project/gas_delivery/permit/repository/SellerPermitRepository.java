package com.project.gas_delivery.permit.repository;

import com.project.gas_delivery.permit.entity.SellerPermitEntity;
import com.project.gas_delivery.permit.enums.PermitStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SellerPermitRepository extends JpaRepository<SellerPermitEntity, Long> {

    Optional<SellerPermitEntity> findBySellerId(Long sellerId);

    boolean existsBySellerIdAndStatus(Long sellerId, PermitStatus status);

    /**
     * Admin review queue. Sorted by submission time (oldest first) so the
     * admin works through applications in the order they arrived.
     */
    @Query("""
            SELECT p FROM SellerPermitEntity p
             WHERE (:status IS NULL OR p.status = :status)
             ORDER BY COALESCE(p.submittedAt, p.createdAt) ASC
            """)
    List<SellerPermitEntity> findForReview(@Param("status") PermitStatus status);

    /**
     * Bulk lookup for the customer/rider seller-filter queries. Returns the
     * set of seller ids that have at least one APPROVED permit. Used to
     * short-circuit {@code GET /api/sellers} before the in-memory joins.
     */
    @Query("SELECT DISTINCT p.sellerId FROM SellerPermitEntity p WHERE p.status = :status")
    List<Long> findSellerIdsByStatus(@Param("status") PermitStatus status);
}
