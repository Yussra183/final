package com.project.gas_delivery.product.dto;

import com.project.gas_delivery.product.entity.ProductEntity;

import java.math.BigDecimal;

/**
 * Wire form of a gas product.
 *
 * <p>Mirrors the frontend's {@code GasProduct} interface in
 * {@code constants/types.ts}. {@code id}, {@code sellerId} are stringified
 * to match the auth {@code UserDto} shape. {@code price} is a number on
 * the frontend but BigDecimal on the wire to preserve precision.</p>
 */
public record ProductDto(
        String id,
        String sellerId,
        String sellerName,
        String name,
        String size,
        BigDecimal price,
        int stock,
        String image,
        String description,
        String category
) {

    public static ProductDto from(ProductEntity e, String sellerName) {
        return new ProductDto(
                String.valueOf(e.getId()),
                String.valueOf(e.getSellerId()),
                sellerName,
                e.getName(),
                e.getSize(),
                e.getPrice(),
                e.getStock(),
                e.getImage(),
                e.getDescription(),
                e.getCategory()
        );
    }
}