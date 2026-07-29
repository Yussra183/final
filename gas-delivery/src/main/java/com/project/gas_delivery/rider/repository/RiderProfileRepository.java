package com.project.gas_delivery.rider.repository;

import com.project.gas_delivery.rider.entity.RiderProfileEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RiderProfileRepository extends JpaRepository<RiderProfileEntity, Long> {
    List<RiderProfileEntity> findByAvailable(boolean available);
}