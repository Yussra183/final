package com.project.gas_delivery.permit.repository;

import com.project.gas_delivery.permit.entity.RiderApplicationEntity;
import com.project.gas_delivery.permit.enums.PermitStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RiderApplicationRepository extends JpaRepository<RiderApplicationEntity, Long> {

    Optional<RiderApplicationEntity> findByRiderId(Long riderId);

    boolean existsByRiderId(Long riderId);

    /**
     * Admin review queue. Sorted by submission time (oldest first) so the
     * admin works through applications in the order they arrived.
     */
    @Query("""
            SELECT r FROM RiderApplicationEntity r
             WHERE (:status IS NULL OR r.status = :status)
             ORDER BY COALESCE(r.submittedAt, r.createdAt) ASC
            """)
    List<RiderApplicationEntity> findForReview(@Param("status") PermitStatus status);

    /**
     * Bulk membership check — used by the dispatch queue mapper to drop
     * riders whose application is not yet APPROVED. Returns the set of
     * rider ids whose {@code rider_applications.status = APPROVED}.
     */
    @Query("SELECT r.riderId FROM RiderApplicationEntity r WHERE r.status = :status")
    List<Long> findRiderIdsByStatus(@Param("status") PermitStatus status);
}