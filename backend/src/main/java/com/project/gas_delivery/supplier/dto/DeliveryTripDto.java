package com.project.gas_delivery.supplier.dto;

import com.project.gas_delivery.supplier.entity.DeliveryTripEntity;
import com.project.gas_delivery.supplier.entity.DeliveryTripStopEntity;
import com.project.gas_delivery.supplier.enums.DeliveryTripStatus;

import java.util.List;

/**
 * Wire form of a delivery operation. Mirrors the frontend's
 * {@code DeliveryTrip} interface in {@code constants/types.ts}.
 *
 * <p>Ids are stringified because every other id on this wire is a string
 * (see {@link DeliveryRouteDto}) and the React Native client compares
 * them with {@code ===} against route/vehicle ids it already holds as
 * strings.</p>
 *
 * <p>{@code polyline} is derived from the snapshotted stops in sequence
 * order — the same derivation {@link DeliveryRouteDto} performs — so the
 * live map can draw the planned path of a running operation even after
 * the underlying route has been edited.</p>
 */
public record DeliveryTripDto(
        String id,
        String supplierId,
        String routeId,
        String routeName,
        String scheduleDay,
        String riderId,
        String riderName,
        String vehicleId,
        String vehiclePlate,
        String supervisorName,
        String supervisorPhone,
        DeliveryTripStatus status,
        String startedAt,
        String completedAt,
        String createdAt,
        List<DeliveryTripStopDto> stops,
        List<double[]> polyline
) {

    public static DeliveryTripDto from(
            DeliveryTripEntity trip,
            List<DeliveryTripStopEntity> stops
    ) {
        List<DeliveryTripStopDto> stopDtos = stops.stream()
                .map(DeliveryTripStopDto::from)
                .toList();
        List<double[]> polyline = stopDtos.stream()
                .map(s -> new double[]{ s.lat(), s.lng() })
                .toList();
        return new DeliveryTripDto(
                String.valueOf(trip.getId()),
                String.valueOf(trip.getSupplierId()),
                String.valueOf(trip.getRouteId()),
                trip.getRouteName(),
                trip.getScheduleDay(),
                trip.getRiderId() == null ? null : String.valueOf(trip.getRiderId()),
                trip.getRiderName(),
                trip.getVehicleId() == null ? null : String.valueOf(trip.getVehicleId()),
                trip.getVehiclePlate(),
                trip.getSupervisorName(),
                trip.getSupervisorPhone(),
                trip.getStatus(),
                trip.getStartedAt() == null ? null : trip.getStartedAt().toString(),
                trip.getCompletedAt() == null ? null : trip.getCompletedAt().toString(),
                trip.getCreatedAt() == null ? null : trip.getCreatedAt().toString(),
                stopDtos,
                polyline
        );
    }
}
