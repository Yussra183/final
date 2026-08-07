package com.project.gas_delivery.supplier.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.supplier.dto.DeliveryRouteDto;
import com.project.gas_delivery.supplier.dto.SupplierVehicleDto;
import com.project.gas_delivery.supplier.entity.DeliveryRouteEntity;
import com.project.gas_delivery.supplier.entity.SupplierVehicleEntity;
import com.project.gas_delivery.supplier.repository.DeliveryRouteRepository;
import com.project.gas_delivery.supplier.repository.DeliveryRouteStopRepository;
import com.project.gas_delivery.supplier.repository.SupplierVehicleRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Set;

/**
 * Supplier logistics CRUD: routes + vehicles.
 *
 * <p>Routes and vehicles are scoped to the signed-in supplier. The
 * service guards against one supplier touching another supplier's data
 * by re-reading the {@code supplierId} from the entity on every write.
 * </p>
 *
 * <p>Reads return every route/vehicle (active and inactive) so the
 * supplier dashboard can render both buckets. The "Start Delivery"
 * form filters on the frontend by {@code active = true}.</p>
 */
@Service
public class SupplierLogisticsService {

    private static final Set<String> VALID_DAYS = Set.of(
            "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"
    );

    private final DeliveryRouteRepository routeRepository;
    private final DeliveryRouteStopRepository routeStopRepository;
    private final SupplierVehicleRepository vehicleRepository;
    private final UserRepository userRepository;

    public SupplierLogisticsService(
            DeliveryRouteRepository routeRepository,
            DeliveryRouteStopRepository routeStopRepository,
            SupplierVehicleRepository vehicleRepository,
            UserRepository userRepository
    ) {
        this.routeRepository = routeRepository;
        this.routeStopRepository = routeStopRepository;
        this.vehicleRepository = vehicleRepository;
        this.userRepository = userRepository;
    }

    /* ---------------- Routes ---------------- */

    @Transactional(readOnly = true)
    public List<DeliveryRouteDto> listRoutesForSupplier(Long supplierId) {
        List<DeliveryRouteEntity> routes =
                routeRepository.findBySupplierIdOrderByScheduleDayAscScheduleTimeAsc(supplierId);
        return routes.stream()
                .map(r -> DeliveryRouteDto.from(
                        r,
                        routeStopRepository.findByRouteIdOrderBySequenceAsc(r.getId())
                ))
                .toList();
    }

    @Transactional
    public DeliveryRouteDto createRoute(
            HttpServletRequest request,
            String name,
            String scheduleDay,
            String scheduleTime
    ) {
        Long actorId = requireSupplier(request);
        validateRoute(name, scheduleDay, scheduleTime);

        DeliveryRouteEntity e = new DeliveryRouteEntity();
        e.setSupplierId(actorId);
        e.setName(name.trim());
        e.setScheduleDay(scheduleDay);
        e.setScheduleTime(scheduleTime);
        e.setActive(true);
        e.setUpdatedAt(Instant.now());
        DeliveryRouteEntity saved = routeRepository.save(e);
        // A new route has no stops yet; the supplier adds them via the
        // existing route detail flow. The live map / polyline are empty
        // until stops exist, which the frontend already handles.
        return DeliveryRouteDto.from(saved, List.of());
    }

    @Transactional
    public DeliveryRouteDto setRouteActive(
            HttpServletRequest request,
            Long routeId,
            boolean active
    ) {
        Long actorId = requireSupplier(request);
        DeliveryRouteEntity route = requireOwnRoute(actorId, routeId);
        route.setActive(active);
        route.setUpdatedAt(Instant.now());
        DeliveryRouteEntity saved = routeRepository.save(route);
        return DeliveryRouteDto.from(
                saved,
                routeStopRepository.findByRouteIdOrderBySequenceAsc(saved.getId())
        );
    }

    /* ---------------- Vehicles ---------------- */

    @Transactional(readOnly = true)
    public List<SupplierVehicleDto> listVehiclesForSupplier(Long supplierId) {
        return vehicleRepository
                .findBySupplierIdOrderByCreatedAtAsc(supplierId)
                .stream()
                .map(SupplierVehicleDto::from)
                .toList();
    }

    @Transactional
    public SupplierVehicleDto createVehicle(
            HttpServletRequest request,
            String plate,
            String model,
            Integer capacityKg
    ) {
        Long actorId = requireSupplier(request);
        if (plate == null || plate.isBlank()) {
            throw new BadRequestException("plate is required");
        }
        if (model == null || model.isBlank()) {
            throw new BadRequestException("model is required");
        }
        if (capacityKg == null || capacityKg <= 0) {
            throw new BadRequestException("capacityKg must be a positive integer");
        }
        SupplierVehicleEntity e = new SupplierVehicleEntity();
        e.setSupplierId(actorId);
        e.setPlate(plate.trim());
        e.setModel(model.trim());
        e.setCapacityKg(capacityKg);
        e.setActive(true);
        e.setUpdatedAt(Instant.now());
        return SupplierVehicleDto.from(vehicleRepository.save(e));
    }

    @Transactional
    public SupplierVehicleDto setVehicleActive(
            HttpServletRequest request,
            Long vehicleId,
            boolean active
    ) {
        Long actorId = requireSupplier(request);
        SupplierVehicleEntity vehicle = requireOwnVehicle(actorId, vehicleId);
        vehicle.setActive(active);
        vehicle.setUpdatedAt(Instant.now());
        return SupplierVehicleDto.from(vehicleRepository.save(vehicle));
    }

    /* ---------------- Helpers ---------------- */

    private Long requireSupplier(HttpServletRequest request) {
        Long actorId = AuthFilter.currentActorId(request);
        Role role = AuthFilter.currentActorRole(request);
        if (actorId == null || role == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        if (role != Role.SUPPLIER) {
            throw new NotAuthorizedException(
                    "Only suppliers can manage delivery routes and vehicles.");
        }
        User user = userRepository.findById(actorId).orElse(null);
        if (user == null || !user.isActive()) {
            throw new NotAuthorizedException("Supplier account is inactive.");
        }
        return actorId;
    }

    private DeliveryRouteEntity requireOwnRoute(Long supplierId, Long routeId) {
        DeliveryRouteEntity route = routeRepository.findById(routeId)
                .orElseThrow(() -> new NotAuthorizedException("Route not found."));
        if (!route.getSupplierId().equals(supplierId)) {
            throw new NotAuthorizedException("Route does not belong to this supplier.");
        }
        return route;
    }

    private SupplierVehicleEntity requireOwnVehicle(Long supplierId, Long vehicleId) {
        SupplierVehicleEntity v = vehicleRepository.findById(vehicleId)
                .orElseThrow(() -> new NotAuthorizedException("Vehicle not found."));
        if (!v.getSupplierId().equals(supplierId)) {
            throw new NotAuthorizedException("Vehicle does not belong to this supplier.");
        }
        return v;
    }

    private static void validateRoute(String name, String scheduleDay, String scheduleTime) {
        if (name == null || name.isBlank()) {
            throw new BadRequestException("name is required");
        }
        if (scheduleDay == null || !VALID_DAYS.contains(scheduleDay)) {
            throw new BadRequestException(
                    "scheduleDay must be one of Mon..Sun");
        }
        if (scheduleTime == null || !scheduleTime.matches("^\\d{2}:\\d{2}$")) {
            throw new BadRequestException("scheduleTime must match HH:MM");
        }
    }
}