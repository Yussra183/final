package com.project.gas_delivery.supplier.repository;

import com.project.gas_delivery.supplier.entity.DeliveryTripStopEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DeliveryTripStopRepository extends JpaRepository<DeliveryTripStopEntity, Long> {

    List<DeliveryTripStopEntity> findByTripIdOrderBySequenceAsc(Long tripId);

    /**
     * Backs the seller-side tracking authorisation: "is this seller a
     * stop on this trip?". Called on every SUBSCRIBE, hence the
     * {@code idx_delivery_trip_stops_seller} index in V18.
     */
    boolean existsByTripIdAndSellerId(Long tripId, Long sellerId);

    void deleteByTripId(Long tripId);
}
