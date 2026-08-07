package com.project.gas_delivery.seller.repository;

import com.project.gas_delivery.seller.entity.SellerProfileEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SellerProfileRepository extends JpaRepository<SellerProfileEntity, Long> {
}