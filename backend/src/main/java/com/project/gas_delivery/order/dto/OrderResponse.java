package com.project.gas_delivery.order.dto;

import com.project.gas_delivery.order.entity.OrderEntity;
import com.project.gas_delivery.order.enums.OrderStatus;

import java.math.BigDecimal;
import java.util.List;

/**
 * Canonical Order JSON envelope returned by every Order Flow endpoint.
 *
 * <p>Mirrors the frontend's {@code Order} interface
 * ({@code constants/types.ts}). Numeric IDs are formatted as
 * {@link String} for symmetry with the {@code UserDto} wire shape.</p>
 *
 * <p>Timestamps are emitted as ISO-8601 strings
 * ({@code "2026-07-17T12:34:56.789Z"}) via {@code Instant.toString()}, which
 * is what the frontend's {@code Order.createdAt: string} field expects.</p>
 */
public record OrderResponse(
        String id,
        String customerId,
        String customerName,
        String sellerId,
        String sellerName,
        String riderId,
        String riderName,
        List<OrderItemDto> items,
        BigDecimal total,
        OrderStatus status,
        String createdAt,
        String updatedAt,
        DeliveryLocationDto deliveryLocation,
        String phone,
        String notes,
        String rejectReason
) {

    public static OrderResponse from(OrderEntity e) {
        return new OrderResponse(
                String.valueOf(e.getId()),
                String.valueOf(e.getCustomerId()),
                e.getCustomerName(),
                String.valueOf(e.getSellerId()),
                e.getSellerName(),
                e.getRiderId() == null ? null : String.valueOf(e.getRiderId()),
                e.getRiderName(),
                e.getItems() == null
                        ? List.of()
                        : e.getItems().stream().map(OrderItemDto::from).toList(),
                e.getTotal(),
                e.getStatus(),
                e.getCreatedAt() == null ? null : e.getCreatedAt().toString(),
                e.getUpdatedAt() == null ? null : e.getUpdatedAt().toString(),
                new DeliveryLocationDto(e.getDeliveryAddress(), e.getDeliveryLat(), e.getDeliveryLng()),
                e.getPhone(),
                e.getNotes(),
                e.getRejectReason()
        );
    }
}
