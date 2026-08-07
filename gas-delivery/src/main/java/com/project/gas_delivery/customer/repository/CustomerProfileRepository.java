package com.project.gas_delivery.customer.repository;

import com.project.gas_delivery.customer.entity.CustomerProfileEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Persistence for the customer's saved location. Keyed by {@code user_id}
 * (the customer's own numeric id), so {@code findById(actorId)} is the
 * only lookup the module needs.
 */
@Repository
public interface CustomerProfileRepository extends JpaRepository<CustomerProfileEntity, Long> {
}
