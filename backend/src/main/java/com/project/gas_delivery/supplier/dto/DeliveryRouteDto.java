package com.project.gas_delivery.supplier.dto;

import com.project.gas_delivery.supplier.entity.DeliveryRouteEntity;
import com.project.gas_delivery.supplier.entity.DeliveryRouteStopEntity;

import java.util.List;

/**
 * Wire form of a delivery route. Mirrors the frontend's
 * {@code DeliveryRoute} interface in {@code constants/types.ts}.
 *
 * <p>The shape mirrors the legacy in-memory representation so the
 * existing React Native client renders the route without any frontend
 * changes: {@code id} (string), {@code name}, {@code scheduleDay},
 * {@code scheduleTime}, {@code stops}, {@code polyline}, {@code active}.
 * The {@code polyline} is derived from the ordered stop list by the
 * service layer.</p>
 */
public record DeliveryRouteDto(
        String id,
        String name,
        String scheduleDay,
        String scheduleTime,
        boolean active,
        List<DeliveryRouteStopDto> stops,
        List<double[]> polyline
) {

    public static DeliveryRouteDto from(
            DeliveryRouteEntity route,
            List<DeliveryRouteStopEntity> stops
    ) {
        List<DeliveryRouteStopDto> stopDtos = stops.stream()
                .map(DeliveryRouteStopDto::from)
                .toList();
        // Polyline = the stop list itself in sequence order; the live map
        // already interpolates between consecutive stops.
        List<double[]> polyline = stopDtos.stream()
                .map(s -> new double[]{ s.lat(), s.lng() })
                .toList();
        return new DeliveryRouteDto(
                String.valueOf(route.getId()),
                route.getName(),
                route.getScheduleDay(),
                route.getScheduleTime(),
                route.isActive(),
                stopDtos,
                polyline
        );
    }
}