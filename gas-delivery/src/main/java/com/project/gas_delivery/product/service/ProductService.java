package com.project.gas_delivery.product.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.product.dto.ProductDto;
import com.project.gas_delivery.product.entity.ProductEntity;
import com.project.gas_delivery.product.repository.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Read access to a seller's product catalog.
 *
 * <p>For MVP we only expose list + stock-update endpoints. The customer
 * lists products to browse; the seller updates stock to keep the catalog
 * in sync.</p>
 */
@Service
public class ProductService {

    private final ProductRepository productRepository;
    private final UserRepository userRepository;

    public ProductService(ProductRepository productRepository, UserRepository userRepository) {
        this.productRepository = productRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<ProductDto> listAll() {
        return map(productRepository.findAll());
    }

    @Transactional(readOnly = true)
    public List<ProductDto> listBySeller(Long sellerId) {
        return map(productRepository.findBySellerIdAndActiveTrueOrderByNameAsc(sellerId));
    }

    @Transactional
    public ProductDto updateStock(Long productId, int newStock) {
        ProductEntity product = productRepository.findById(productId)
                .orElseThrow(() -> new com.project.gas_delivery.auth.exception.ResourceNotFoundException(
                        "Product " + productId + " not found."));
        if (newStock < 0) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    "Stock cannot be negative.");
        }
        // Permit gating: only active sellers (admin-approved) may update
        // stock. Pending / rejected sellers have is_active=false, so this
        // check covers them too.
        User owner = userRepository.findById(product.getSellerId())
                .orElseThrow(() -> new com.project.gas_delivery.auth.exception.ResourceNotFoundException(
                        "Product " + productId + " has no associated seller."));
        if (owner.getRole() != Role.SELLER || !owner.isActive()) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "Your account is awaiting permit verification; stock updates are disabled.");
        }
        product.setStock(newStock);
        ProductEntity saved = productRepository.save(product);
        String sellerName = userRepository.findById(saved.getSellerId())
                .map(User::getFullName)
                .orElse(null);
        return ProductDto.from(saved, sellerName);
    }

    private List<ProductDto> map(List<ProductEntity> entities) {
        if (entities.isEmpty()) return List.of();

        // Batch-load seller full names.
        List<Long> sellerIds = entities.stream().map(ProductEntity::getSellerId).distinct().toList();
        Map<Long, String> names = new HashMap<>();
        for (User u : userRepository.findAllById(sellerIds)) {
            if (u.getRole() == Role.SELLER) names.put(u.getId(), u.getFullName());
        }

        return entities.stream()
                .map(e -> ProductDto.from(e, names.get(e.getSellerId())))
                .toList();
    }
}