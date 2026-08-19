package com.project.gas_delivery.product.service;

import com.project.gas_delivery.product.GasCatalog;
import com.project.gas_delivery.product.entity.ProductEntity;
import com.project.gas_delivery.product.repository.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * Keeps each seller's inventory aligned with the canonical gas-brand
 * catalogue so customers can always order valid brand/size combinations.
 */
@Service
public class GasCatalogProvisioningService {

    private final ProductRepository productRepository;

    public GasCatalogProvisioningService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @Transactional
    public void provisionForSeller(Long sellerId) {
        List<ProductEntity> existing = productRepository.findAllBySellerIdOrderByNameAsc(sellerId);
        List<ProductEntity> dirty = new ArrayList<>();

        for (ProductEntity product : existing) {
            if (!"accessory".equals(product.getCategory())
                    && shouldDeactivate(product.getName(), product.getSize())) {
                if (product.isActive()) {
                    product.setActive(false);
                    dirty.add(product);
                }
                continue;
            }

            if (GasCatalog.isSupportedBrand(product.getName())
                    && GasCatalog.isSupportedSize(product.getName(), product.getSize())) {
                if (!product.isActive()) {
                    product.setActive(true);
                    dirty.add(product);
                }
                if (!"refill".equals(product.getCategory())) {
                    product.setCategory("refill");
                    dirty.add(product);
                }
            }
        }

        for (GasCatalog.CatalogEntry entry : GasCatalog.entries()) {
            ProductEntity match = existing.stream()
                    .filter(product -> sameProduct(product, sellerId, entry.brand(), entry.size()))
                    .findFirst()
                    .orElse(null);
            if (match != null) {
                continue;
            }
            dirty.add(new ProductEntity(
                    sellerId,
                    entry.brand(),
                    entry.size(),
                    entry.defaultPrice(),
                    entry.defaultStock(),
                    "refill",
                    entry.description(),
                    "🔥"
            ));
        }

        if (!dirty.isEmpty()) {
            productRepository.saveAll(dirty);
        }
    }

    private static boolean sameProduct(ProductEntity product, Long sellerId, String brand, String size) {
        return sellerId.equals(product.getSellerId())
                && brand.equals(product.getName())
                && size.equals(product.getSize());
    }

    private static boolean shouldDeactivate(String name, String size) {
        if (name == null) return true;
        String trimmedName = name.trim();
        if (trimmedName.regionMatches(true, 0, "LPG", 0, 3)
                || trimmedName.regionMatches(true, 0, "New Cylinder", 0, "New Cylinder".length())) {
            return true;
        }
        return !GasCatalog.isSupportedBrand(trimmedName)
                || !GasCatalog.isSupportedSize(trimmedName, size);
    }
}
