package com.project.gas_delivery.supplier.controller;

import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.rider.dto.RiderProfileDto;
import com.project.gas_delivery.supplier.dto.DeliveryRouteDto;
import com.project.gas_delivery.supplier.dto.SupplierVehicleDto;
import com.project.gas_delivery.supplier.service.SupplierLogisticsService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
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
 *   <li>{@code PATCH /api/routes/{id}} — edit a route's name / day /
 *       time. Stops are managed separately so editing metadata cannot
 *       silently drop stops.</li>
 *   <li>{@code PUT /api/routes/{id}/stops} — replace the full ordered
 *       seller stop list. Body: {@code { sellerIds: [Long, ...] }}.
 *       Each seller is resolved against {@code SellerProfileRepository}
 *       and their real {@code businessName}/{@code address}/{@code lat}/
 *       {@code lng} is copied into the stop row; a seller without valid
 *       coordinates is rejected with 400.</li>
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
        Long riderId = longOrNull(body.get("riderId"));
        Long vehicleId = longOrNull(body.get("vehicleId"));
        String supervisorName = stringOrNull(body.get("supervisorName"));
        String supervisorPhone = stringOrNull(body.get("supervisorPhone"));
        return service.createRoute(
                request, name, scheduleDay, scheduleTime,
                riderId, vehicleId, supervisorName, supervisorPhone);
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

    @PatchMapping("/api/routes/{id}")
    public DeliveryRouteDto updateRoute(
            HttpServletRequest request,
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        requireSupplier(request);
        String name = stringOrNull(body.get("name"));
        String scheduleDay = stringOrNull(body.get("scheduleDay"));
        String scheduleTime = stringOrNull(body.get("scheduleTime"));
        Long riderId = longOrNull(body.get("riderId"));
        Long vehicleId = longOrNull(body.get("vehicleId"));
        String supervisorName = stringOrNull(body.get("supervisorName"));
        String supervisorPhone = stringOrNull(body.get("supervisorPhone"));
        return service.updateRoute(
                request, id, name, scheduleDay, scheduleTime,
                riderId, vehicleId, supervisorName, supervisorPhone);
    }

    @PutMapping("/api/routes/{id}/stops")
    @SuppressWarnings("unchecked")
    public DeliveryRouteDto replaceRouteStops(
            HttpServletRequest request,
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        requireSupplier(request);
        Object raw = body.get("sellerIds");
        if (!(raw instanceof List<?> list)) {
            throw new BadRequestException("sellerIds must be an array of seller ids");
        }
        List<Long> sellerIds = new java.util.ArrayList<>(list.size());
        for (Object item : list) {
            if (item == null) {
                throw new BadRequestException("sellerIds must not contain null");
            }
            if (item instanceof Number n) {
                sellerIds.add(n.longValue());
            } else {
                try {
                    sellerIds.add(Long.parseLong(item.toString()));
                } catch (NumberFormatException ex) {
                    throw new BadRequestException(
                            "sellerIds must contain numbers, got: " + item);
                }
            }
        }
        return service.replaceRouteStops(request, id, sellerIds);
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

    /* ---------------- Supplier ↔ Rider (V19) ---------------- */

    /**
     * List the riders the supplier has explicitly assigned to their
     * company. The full {@link RiderProfileDto} shape is returned so
     * the Add Route / Edit Route rider picker can render the rows
     * without a second round-trip to {@code /api/riders}.
     */
    @GetMapping("/api/supplier-riders")
    public List<RiderProfileDto> listSupplierRiders(HttpServletRequest request) {
        Long supplierId = requireSupplier(request);
        return service.listSupplierRiders(supplierId);
    }

    /**
     * Add an existing rider to the supplier's company roster. The
     * rider must already exist, be a {@code RIDER}, and be active —
     * all enforced server-side by
     * {@code SupplierLogisticsService.requireOwnRider}.
     */
    @PostMapping("/api/supplier-riders")
    public Map<String, Object> linkSupplierRider(
            HttpServletRequest request,
            @RequestBody Map<String, Object> body
    ) {
        Long supplierId = requireSupplier(request);
        Long riderId = longOrNull(body.get("riderId"));
        service.linkSupplierRider(supplierId, riderId);
        return Map.of("supplierId", supplierId, "riderId", riderId);
    }

    /**
     * Remove a rider from the supplier's roster. Idempotent so the
     * Fleet screen's toggle can fire-and-forget without surfacing
     * errors when the link was already absent.
     */
    @DeleteMapping("/api/supplier-riders/{riderId}")
    public void unlinkSupplierRider(
            HttpServletRequest request,
            @PathVariable Long riderId
    ) {
        Long supplierId = requireSupplier(request);
        service.unlinkSupplierRider(supplierId, riderId);
    }

    /**
     * Create a new rider that is owned by the signed-in supplier by
     * construction. The response is the freshly persisted
     * {@link RiderProfileDto} with its real numeric id (e.g.
     * {@code "27"}) so the client can drop it into the Add Route
     * rider picker immediately.
     *
     * <p>Business rule: the supplier creates their own riders —
     * there is no public rider sign-up flow and admin is read-only on
     * this surface. The new {@code users} row is created with
     * {@code role=RIDER}, an unusable random password hash, and a
     * {@code supplier_riders(supplierId, newId)} join row written in
     * the same transaction.</p>
     */
    @PostMapping("/api/supplier-riders/riders")
    public RiderProfileDto createSupplierRider(
            HttpServletRequest request,
            @RequestBody Map<String, Object> body
    ) {
        requireSupplier(request);
        String fullName = stringOrNull(body.get("fullName"));
        String phone = stringOrNull(body.get("phone"));
        String licenseNo = stringOrNull(body.get("licenseNo"));
        String vehicleType = stringOrNull(body.get("vehicleType"));
        String vehiclePlate = stringOrNull(body.get("vehiclePlate"));
        String vehicleModel = stringOrNull(body.get("vehicleModel"));
        return service.createSupplierRider(
                request, fullName, phone, licenseNo,
                vehicleType, vehiclePlate, vehicleModel);
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

    private static Long longOrNull(Object raw) {
        if (raw == null) return null;
        if (raw instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(raw.toString());
        } catch (NumberFormatException ex) {
            throw new BadRequestException(
                    "Expected a numeric id, got: " + raw);
        }
    }
}