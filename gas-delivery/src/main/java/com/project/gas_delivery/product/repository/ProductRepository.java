package com.project.gas_delivery.product.repository;

import com.project.gas_delivery.product.entity.ProductEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface ProductRepository extends JpaRepository<ProductEntity, Long> {

    /** All active products for one seller — used by the customer's product list. */
    List<ProductEntity> findBySellerIdAndActiveTrueOrderByNameAsc(Long sellerId);

    /** Batch lookup of active products across many sellers — used by the
     *  seller-profile enrichment to compute the available-sizes set. */
    List<ProductEntity> findBySellerIdInAndActiveTrue(Collection<Long> sellerIds);
}