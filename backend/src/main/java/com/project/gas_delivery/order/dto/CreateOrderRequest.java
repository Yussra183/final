package com.project.gas_delivery.order.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

/**
 * Payload for {@code POST /api/orders}.
 *
 * <p>IDs are received as {@link String} per the frontend's wire contract;
 * the service layer parses them to {@code Long} before persisting.</p>
 */
public record CreateOrderRequest(
        @NotBlank(message = "customerId is required")
        String customerId,

        @NotBlank(message = "customerName is required")
        @Size(max = 120)
        String customerName,

        @NotBlank(message = "sellerId is required")
        String sellerId,

        @NotBlank(message = "sellerName is required")
        @Size(max = 120)
        String sellerName,

        @NotEmpty(message = "items must not be empty")
        @Valid
        List<OrderItemDto> items,

        @NotNull(message = "total is required")
        @PositiveOrZero(message = "total must be >= 0")
        BigDecimal total,

        @NotBlank(message = "phone is required")
        @Size(max = 30)
        String phone,

        @NotNull(message = "deliveryLocation is required")
        @Valid
        DeliveryLocationDto deliveryLocation,

        @Size(max = 1000)
        String notes
) {
}
