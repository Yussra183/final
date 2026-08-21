package com.project.gas_delivery.supplier.dto;

import com.project.gas_delivery.supplier.entity.DeliveryTripStopEntity;

/**
 * Wire form of a trip stop — the snapshot the running operation actually
 * serves. Mirrors the frontend's {@code RouteStop} interface in
 * {@code constants/types.ts}, including the lowercase {@code status}
 * union, so the existing supplier/seller map components render it with no
 * shape translation.
 */
public record DeliveryTripStopDto(
        Long sellerId,
        String sellerName,
        int sequence,
        String address,
        double lat,
        double lng,
        String status,
        String deliveredAt
) {

    public static DeliveryTripStopDto from(DeliveryTripStopEntity e) {
        return new DeliveryTripStopDto(
                e.getSellerId(),
                e.getSellerName(),
                e.getSequence(),
                e.getAddress(),
                e.getLat(),
                e.getLng(),
                e.getStatus(),
                e.getDeliveredAt() == null ? null : e.getDeliveredAt().toString()
        );
    }
}
