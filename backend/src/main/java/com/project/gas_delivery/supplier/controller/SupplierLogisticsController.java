package com.project.gas_delivery.supplier.controller;

import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.supplier.dto.DeliveryRouteDto;
import com.project.gas_delivery.supplier.dto.SupplierVehicleDto;
import com.project.gas_delivery.supplier.service.SupplierLogisticsService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Supplier logistics CRUD endpoints.
 *
 * <ul>
 *   <li>{@code GET /api/routes} — list every route owned by the signed-in
 *       supplier. Returns active and inactive routes.</li>
 *   <li>{@code POST /api/routes} — create a route. Body:
 *       {@code { name, scheduleDay, scheduleTime }}. The supplier
 *       assigns stops later via the existing route-detail flow.</li>
 *   <li>{@code PATCH /api/routes/{id}/active} — flip a route's active
 *       flag. Only the owning supplier may do this.</li>
 *   <li>{@code GET /api/vehicles} — list every vehicle owned by the
 *       signed-in supplier. Returns active and inactive vehicles.</li>
 *   <li>{@code POST /api/vehicles} — create a vehicle. Body:
 *       {@code { plate, model, capacityKg }}.</li>
 *   <li>{@code PATCH /api/vehicles/{id}/active} — flip a vehicle's
 *       active flag. Only the owning supplier may do this.</li>
 * </ul>
 *
 * <p>All endpoints require the actor to be a supplier.</p>
 */
@RestController
public class SupplierLogisticsController {

    private final SupplierLogisticsService service;
    private final UserRepository userRepository;

    public SupplierLogisticsController(
            SupplierLogisticsService service,
            UserRepository userRepository
    ) {
        this.service = service;
        this.userRepository = userRepository;
    }

    @GetMapping("/api/routes")
    public List<DeliveryRouteDto> listRoutes(HttpServletRequest request) {
        Long supplierId = requireSupplier(request);
        return service.listRoutesForSupplier(supplierId);
    }

    @PostMapping("/api/routes")
    public DeliveryRouteDto createRoute(
            HttpServletRequest request,
            @RequestBody Map<String, Object> body
    ) {
        requireSupplier(request);
        String name = stringOrNull(body.get("name"));
        String scheduleDay = stringOrNull(body.get("scheduleDay"));
        String scheduleTime = stringOrNull(body.get("scheduleTime"));
        return service.createRoute(request, name, scheduleDay, scheduleTime);
    }

    @PatchMapping("/api/routes/{id}/active")
    public DeliveryRouteDto setRouteActive(
            HttpServletRequest request,
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        requireSupplier(request);
        Object raw = body.get("active");
        if (raw == null) {
            throw new BadRequestException("active is required");
        }
        boolean active = (raw instanceof Boolean b)
                ? b
                : Boolean.parseBoolean(raw.toString());
        return service.setRouteActive(request, id, active);
    }

    @GetMapping("/api/vehicles")
    public List<SupplierVehicleDto> listVehicles(HttpServletRequest request) {
        Long supplierId = requireSupplier(request);
        return service.listVehiclesForSupplier(supplierId);
    }

    @PostMapping("/api/vehicles")
    public SupplierVehicleDto createVehicle(
            HttpServletRequest request,
            @RequestBody Map<String, Object> body
    ) {
        requireSupplier(request);
        String plate = stringOrNull(body.get("plate"));
        String model = stringOrNull(body.get("model"));
        Integer capacityKg = intOrNull(body.get("capacityKg"));
        return service.createVehicle(request, plate, model, capacityKg);
    }

    @PatchMapping("/api/vehicles/{id}/active")
    public SupplierVehicleDto setVehicleActive(
            HttpServletRequest request,
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        requireSupplier(request);
        Object raw = body.get("active");
        if (raw == null) {
            throw new BadRequestException("active is required");
        }
        boolean active = (raw instanceof Boolean b)
                ? b
                : Boolean.parseBoolean(raw.toString());
        return service.setVehicleActive(request, id, active);
    }

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
        if (userRepository.findById(actorId).orElse(null) == null) {
            throw new NotAuthorizedException("Supplier account not found.");
        }
        return actorId;
    }

    private static String stringOrNull(Object raw) {
        return raw == null ? null : raw.toString();
    }

    private static Integer intOrNull(Object raw) {
        if (raw == null) return null;
        if (raw instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(raw.toString());
        } catch (NumberFormatException ex) {
            throw new BadRequestException("capacityKg must be an integer");
        }
    }
}