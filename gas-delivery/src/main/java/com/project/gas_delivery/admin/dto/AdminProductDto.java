package com.project.gas_delivery.admin.dto;

import com.project.gas_delivery.product.entity.ProductEntity;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * A product row for the admin catalogue screen.
 *
 * <p>Differs from {@link com.project.gas_delivery.product.dto.ProductDto}
 * in exposing {@code active} and the timestamps — admins list inactive
 * products too, whereas the customer-facing endpoint filters them out.</p>
 */
public record AdminProductDto(
        String id,
        String sellerId,
        String sellerName,
        String name,
        String size,
        BigDecimal price,
        int stock,
        String category,
        String description,
        String image,
        boolean active,
        Instant createdAt,
        Instant updatedAt
) {

    public static AdminProductDto from(ProductEntity e, String sellerName) {
        return new AdminProductDto(
                String.valueOf(e.getId()),
                String.valueOf(e.getSellerId()),
                sellerName,
                e.getName(),
                e.getSize(),
                e.getPrice(),
                e.getStock(),
                e.getCategory(),
                e.getDescription(),
                e.getImage(),
                e.isActive(),
                e.getCreatedAt(),
                e.getUpdatedAt()
        );
    }
}
