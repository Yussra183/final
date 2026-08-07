package com.project.gas_delivery.supplier.dto;

import com.project.gas_delivery.supplier.entity.DeliveryRouteStopEntity;

/**
 * Wire form of a route stop. The status field is always "pending" for
 * newly-created routes; the in-flight stop status lives on the trip,
 * not on the route definition.
 */
public record DeliveryRouteStopDto(
        Long sellerId,
        String sellerName,
        int sequence,
        String address,
        double lat,
        double lng,
        String status
) {

    public static DeliveryRouteStopDto from(DeliveryRouteStopEntity e) {
        return new DeliveryRouteStopDto(
                e.getSellerId(),
                e.getSellerName(),
                e.getSequence(),
                e.getAddress(),
                e.getLat(),
                e.getLng(),
                "pending"
        );
    }
}