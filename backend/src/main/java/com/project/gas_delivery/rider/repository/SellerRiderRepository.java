package com.project.gas_delivery.rider.repository;

import com.project.gas_delivery.rider.entity.SellerRiderEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SellerRiderRepository
        extends JpaRepository<SellerRiderEntity, SellerRiderEntity.PK> {

    /** Riders assigned to a particular seller. */
    List<SellerRiderEntity> findBySellerId(Long sellerId);

    /** Sellers a particular rider is assigned to. Used by the dispatch
     *  queue filter so a rider only sees orders from sellers they cover. */
    List<SellerRiderEntity> findByRiderId(Long riderId);

    /** Single-query fetch of all seller ids a rider is assigned to. */
    @Query("SELECT sr.sellerId FROM SellerRiderEntity sr WHERE sr.riderId = :riderId")
    List<Long> findSellerIdsByRiderId(@Param("riderId") Long riderId);

    /**
     * Membership check used by {@code OrderService.claim} so a rider can
     * only claim orders from sellers they're assigned to. Spring Data
     * derives the count query from the method name.
     */
    boolean existsBySellerIdAndRiderId(Long sellerId, Long riderId);
}