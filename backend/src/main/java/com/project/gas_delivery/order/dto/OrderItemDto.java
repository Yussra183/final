package com.project.gas_delivery.order.dto;

import com.project.gas_delivery.order.entity.OrderItemEmbeddable;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

/**
 * Wire form of a single line item. Shape matches the frontend's
 * {@code OrderItem} interface exactly — same field names, same types —
 * so Jackson serialises request and response items identically.
 */
public record OrderItemDto(
        @NotBlank(message = "productId is required")
        String productId,

        @NotBlank(message = "productName is required")
        String productName,

        @NotBlank(message = "size is required")
        String size,

        @Min(value = 1, message = "quantity must be at least 1")
        int quantity,

        @NotNull(message = "unitPrice is required")
        @PositiveOrZero(message = "unitPrice must be >= 0")
        BigDecimal unitPrice
) {

    public static OrderItemDto from(OrderItemEmbeddable e) {
        return new OrderItemDto(
                e.productId(),
                e.productName(),
                e.size(),
                e.quantity(),
                e.unitPrice()
        );
    }

    public OrderItemEmbeddable toEmbeddable() {
        return new OrderItemEmbeddable(productId, productName, size, quantity, unitPrice);
    }
}
