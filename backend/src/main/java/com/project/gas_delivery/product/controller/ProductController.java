package com.project.gas_delivery.product.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.product.dto.ProductDto;
import com.project.gas_delivery.product.service.ProductService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST endpoints for the product catalog.
 *
 * <ul>
 *   <li>{@code GET /api/products} — list every active product. Used by the
 *       customer's "All Products" / browse view.</li>
 *   <li>{@code GET /api/products?sellerId=N} — list a single seller's
 *       products. Used by the customer's per-seller product list.</li>
 *   <li>{@code PATCH /api/products/{id}/stock} — seller updates stock for
 *       their own product.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping
    public List<ProductDto> list(
            @RequestParam(required = false) String sellerId
    ) {
        if (sellerId != null && !sellerId.isBlank()) {
            return productService.listBySeller(parseLong(sellerId, "sellerId"));
        }
        return productService.listAll();
    }

    @PatchMapping("/{id}/stock")
    public ProductDto updateStock(
            HttpServletRequest request,
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        Role role = AuthFilter.currentActorRole(request);
        if (role != Role.SELLER) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "Only sellers can update product stock.");
        }
        Object raw = body.get("stock");
        if (raw == null) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    "stock is required.");
        }
        int stock = (raw instanceof Number n)
                ? n.intValue()
                : Integer.parseInt(raw.toString());
        return productService.updateStock(id, stock);
    }

    @org.springframework.web.bind.annotation.PutMapping("/{id}")
    public ProductDto update(
            HttpServletRequest request,
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        Role role = AuthFilter.currentActorRole(request);
        if (role != Role.SELLER) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "Only sellers can edit products.");
        }
        Object rawPrice = body.get("price");
        java.math.BigDecimal price = null;
        if (rawPrice != null) {
            price = new java.math.BigDecimal(rawPrice.toString());
        }
        String description = (String) body.get("description");
        return productService.updateProduct(id, price, description);
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/{id}")
    public void delete(
            HttpServletRequest request,
            @PathVariable Long id
    ) {
        Role role = AuthFilter.currentActorRole(request);
        if (role != Role.SELLER) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "Only sellers can delete products.");
        }
        productService.deleteProduct(id);
    }

    private static Long parseLong(String raw, String field) {
        try {
            return Long.parseLong(raw.trim());
        } catch (NumberFormatException e) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    field + " must be a numeric id.");
        }
    }
}