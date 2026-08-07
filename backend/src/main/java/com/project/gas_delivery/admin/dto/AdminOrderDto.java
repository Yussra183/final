package com.project.gas_delivery.admin.dto;

import com.project.gas_delivery.order.entity.OrderEntity;
import com.project.gas_delivery.order.enums.OrderStatus;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * An order row for the admin orders list.
 *
 * <p>Lighter than {@link com.project.gas_delivery.order.dto.OrderResponse}
 * — the list view shows parties, status, money, date and destination, and
 * doesn't need the line-item JSON. The single-order endpoint returns the
 * full {@code OrderResponse} so there stays one canonical Order shape.</p>
 */
public record AdminOrderDto(
        String id,
        String customerId,
        String customerName,
        String sellerId,
        String sellerName,
        String riderId,
        String riderName,
        OrderStatus status,
        BigDecimal total,
        int itemCount,
        String deliveryAddress,
        Double deliveryLat,
        Double deliveryLng,
        String phone,
        String rejectReason,
        Instant createdAt,
        Instant updatedAt
) {

    public static AdminOrderDto from(OrderEntity e) {
        return new AdminOrderDto(
                String.valueOf(e.getId()),
                String.valueOf(e.getCustomerId()),
                e.getCustomerName(),
                String.valueOf(e.getSellerId()),
                e.getSellerName(),
                e.getRiderId() == null ? null : String.valueOf(e.getRiderId()),
                e.getRiderName(),
                e.getStatus(),
                e.getTotal(),
                e.getItems() == null ? 0 : e.getItems().size(),
                e.getDeliveryAddress(),
                e.getDeliveryLat(),
                e.getDeliveryLng(),
                e.getPhone(),
                e.getRejectReason(),
                e.getCreatedAt(),
                e.getUpdatedAt()
        );
    }
}
