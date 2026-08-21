package com.project.gas_delivery.supplier.dto;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.supplier.entity.DeliveryRouteEntity;
import com.project.gas_delivery.supplier.entity.DeliveryRouteStopEntity;
import com.project.gas_delivery.supplier.entity.SupplierVehicleEntity;

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
 *
 * <p>V19 added four crew fields to the route row so a recurring
 * weekly schedule can carry the same Supervisor / Rider / Vehicle
 * across instances. The rider and vehicle are denormalised as
 * {@code riderName} / {@code vehiclePlate} so the mobile client can
 * render crew labels without re-fetching the joined user / vehicle
 * row. Both denormalised fields are nullable — the route can be
 * saved without a rider or vehicle assigned.</p>
 *
 * <p>V19.1 — also denormalises {@code riderPhone} so the supplier's
 * Route Details screen can render a Call button next to the rider
 * without performing a second lookup that could surface
 * {@code "Rider does not belong to this supplier"} and mask the
 * real cause of the (already-vetted) route. The phone is sourced
 * from the same {@code User} row that owns the rider id.</p>
 */
public record DeliveryRouteDto(
        String id,
        String name,
        String scheduleDay,
        String scheduleTime,
        boolean active,
        List<DeliveryRouteStopDto> stops,
        List<double[]> polyline,
        // V19 — route-level crew captured at Add / Edit Route:
        String riderId,
        String riderName,
        String riderPhone,
        String vehicleId,
        String vehiclePlate,
        String supervisorName,
        String supervisorPhone
) {

    /**
     * Convenience overload for callers that don't have the joined
     * rider / vehicle rows (e.g. {@code setRouteActive}, which only
     * flips the active flag and the crew hasn't changed).
     */
    public static DeliveryRouteDto from(
            DeliveryRouteEntity route,
            List<DeliveryRouteStopEntity> stops
    ) {
        return from(route, stops, null, null);
    }

    /**
     * Full overload that denormalises {@code riderName} and
     * {@code vehiclePlate} from the joined rows. Either join row may
     * be {@code null} when the route has no rider / vehicle assigned.
     */
    public static DeliveryRouteDto from(
            DeliveryRouteEntity route,
            List<DeliveryRouteStopEntity> stops,
            User rider,
            SupplierVehicleEntity vehicle
    ) {
        List<DeliveryRouteStopDto> stopDtos = stops.stream()
                .map(DeliveryRouteStopDto::from)
                .toList();
        // Polyline = the stop list itself in sequence order; the live map
        // already interpolates between consecutive stops.
        List<double[]> polyline = stopDtos.stream()
                .map(s -> new double[]{ s.lat(), s.lng() })
                .toList();
        String riderName = rider == null ? null : rider.getFullName();
        String riderPhone = rider == null ? null : rider.getPhone();
        String vehiclePlate = vehicle == null ? null : vehicle.getPlate();
        return new DeliveryRouteDto(
                String.valueOf(route.getId()),
                route.getName(),
                route.getScheduleDay(),
                route.getScheduleTime(),
                route.isActive(),
                stopDtos,
                polyline,
                route.getRiderId() == null ? null : String.valueOf(route.getRiderId()),
                riderName,
                riderPhone,
                route.getVehicleId() == null ? null : String.valueOf(route.getVehicleId()),
                vehiclePlate,
                route.getSupervisorName(),
                route.getSupervisorPhone()
        );
    }
}
