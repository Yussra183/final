package com.project.gas_delivery.supplier.repository;

import com.project.gas_delivery.supplier.entity.DeliveryRouteStopEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DeliveryRouteStopRepository extends JpaRepository<DeliveryRouteStopEntity, Long> {
    List<DeliveryRouteStopEntity> findByRouteIdOrderBySequenceAsc(Long routeId);
}