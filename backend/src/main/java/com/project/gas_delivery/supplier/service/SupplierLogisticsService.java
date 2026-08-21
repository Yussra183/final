package com.project.gas_delivery.supplier.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.rider.dto.RiderProfileDto;
import com.project.gas_delivery.rider.entity.RiderProfileEntity;
import com.project.gas_delivery.rider.repository.RiderProfileRepository;
import com.project.gas_delivery.seller.entity.SellerProfileEntity;
import com.project.gas_delivery.seller.repository.SellerProfileRepository;
import com.project.gas_delivery.supplier.dto.DeliveryRouteDto;
import com.project.gas_delivery.supplier.dto.SupplierVehicleDto;
import com.project.gas_delivery.supplier.entity.DeliveryRouteEntity;
import com.project.gas_delivery.supplier.entity.DeliveryRouteStopEntity;
import com.project.gas_delivery.supplier.entity.SupplierRiderEntity;
import com.project.gas_delivery.supplier.entity.SupplierVehicleEntity;
import com.project.gas_delivery.supplier.repository.DeliveryRouteRepository;
import com.project.gas_delivery.supplier.repository.DeliveryRouteStopRepository;
import com.project.gas_delivery.supplier.repository.SupplierRiderRepository;
import com.project.gas_delivery.supplier.repository.SupplierVehicleRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Supplier logistics CRUD: routes, vehicles, and supplier↔rider assignments.
 *
 * <p>Routes and vehicles are scoped to the signed-in supplier. The
 * service guards against one supplier touching another supplier's data
 * by re-reading the {@code supplierId} from the entity on every write.
 * </p>
 *
 * <p>V19 added route-level crew (supervisor + rider + vehicle) and a
 * {@code supplier_riders} join table that the Add Route / Edit Route
 * sheets feed. {@link #requireOwnRider} is the canonical guard for
 * "this rider has been explicitly assigned to my company" — the
 * {@link SupplierTripService} trip-create path calls the same guard
 * so a route and its trip can't disagree on who the rider is.</p>
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

    /**
     * Relaxed E.164-ish regex. We accept digits, spaces, parentheses,
     * dashes, and an optional leading {@code +}. Length 6..30 to
     * comfortably fit local formats like {@code +255 7XX XXX XXX}.
     */
    private static final java.util.regex.Pattern PHONE_PATTERN =
            java.util.regex.Pattern.compile("^[+]?[0-9 ()\\-]{6,30}$");

    private final DeliveryRouteRepository routeRepository;
    private final DeliveryRouteStopRepository routeStopRepository;
    private final SupplierVehicleRepository vehicleRepository;
    private final SellerProfileRepository sellerProfileRepository;
    private final UserRepository userRepository;
    private final RiderProfileRepository riderProfileRepository;
    private final SupplierRiderRepository supplierRiderRepository;
    private final PasswordEncoder passwordEncoder;

    public SupplierLogisticsService(
            DeliveryRouteRepository routeRepository,
            DeliveryRouteStopRepository routeStopRepository,
            SupplierVehicleRepository vehicleRepository,
            SellerProfileRepository sellerProfileRepository,
            UserRepository userRepository,
            RiderProfileRepository riderProfileRepository,
            SupplierRiderRepository supplierRiderRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.routeRepository = routeRepository;
        this.routeStopRepository = routeStopRepository;
        this.vehicleRepository = vehicleRepository;
        this.sellerProfileRepository = sellerProfileRepository;
        this.userRepository = userRepository;
        this.riderProfileRepository = riderProfileRepository;
        this.supplierRiderRepository = supplierRiderRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /* ---------------- Routes ---------------- */

    @Transactional(readOnly = true)
    public List<DeliveryRouteDto> listRoutesForSupplier(Long supplierId) {
        List<DeliveryRouteEntity> routes =
                routeRepository.findBySupplierIdOrderByScheduleDayAscScheduleTimeAsc(supplierId);
        return routes.stream()
                .map(r -> DeliveryRouteDto.from(
                        r,
                        routeStopRepository.findByRouteIdOrderBySequenceAsc(r.getId()),
                        findRiderOrNull(r.getRiderId()),
                        findVehicleOrNull(r.getVehicleId())
                ))
                .toList();
    }

    /**
     * Create a route with the optional V19 crew. Stops are added
     * separately via {@link #replaceRouteStops}; this method only
     * persists the route row + the captured crew.
     */
    @Transactional
    public DeliveryRouteDto createRoute(
            HttpServletRequest request,
            String name,
            String scheduleDay,
            String scheduleTime,
            Long riderId,
            Long vehicleId,
            String supervisorName,
            String supervisorPhone
    ) {
        Long actorId = requireSupplier(request);
        validateRoute(name, scheduleDay, scheduleTime);
        validateSupervisor(supervisorName, supervisorPhone);
        User rider = resolveRider(actorId, riderId);
        SupplierVehicleEntity vehicle = resolveVehicle(actorId, vehicleId);

        DeliveryRouteEntity e = new DeliveryRouteEntity();
        e.setSupplierId(actorId);
        e.setName(name.trim());
        e.setScheduleDay(scheduleDay);
        e.setScheduleTime(scheduleTime);
        e.setActive(true);
        e.setRiderId(rider == null ? null : rider.getId());
        e.setVehicleId(vehicle == null ? null : vehicle.getId());
        e.setSupervisorName(supervisorName == null ? null : supervisorName.trim());
        e.setSupervisorPhone(supervisorPhone == null ? null : supervisorPhone.trim());
        e.setUpdatedAt(Instant.now());
        DeliveryRouteEntity saved = routeRepository.save(e);
        // A new route has no stops yet; the supplier adds them via
        // {@link #replaceRouteStops}. The live map / polyline are
        // empty until stops exist, which the frontend already handles.
        return DeliveryRouteDto.from(saved, List.of(), rider, vehicle);
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
                routeStopRepository.findByRouteIdOrderBySequenceAsc(saved.getId()),
                findRiderOrNull(saved.getRiderId()),
                findVehicleOrNull(saved.getVehicleId())
        );
    }

    /**
     * Edit a route's name / day / time / V19 crew. The route's seller
     * stops are managed exclusively via {@link #replaceRouteStops} so
     * that editing metadata cannot silently drop stops.
     *
     * <p>{@code riderId}, {@code vehicleId}, {@code supervisorName} and
     * {@code supervisorPhone} are all nullable: a {@code null} value
     * clears that field on the route. Pass {@code null} explicitly to
     * remove the crew assignment.</p>
     */
    @Transactional
    public DeliveryRouteDto updateRoute(
            HttpServletRequest request,
            Long routeId,
            String name,
            String scheduleDay,
            String scheduleTime,
            Long riderId,
            Long vehicleId,
            String supervisorName,
            String supervisorPhone
    ) {
        Long actorId = requireSupplier(request);
        validateRoute(name, scheduleDay, scheduleTime);
        // `null` is the explicit "clear" signal. Reject only the cases
        // where the supplier typed something invalid for the field.
        if (supervisorName != null || supervisorPhone != null) {
            validateSupervisor(supervisorName, supervisorPhone);
        }
        DeliveryRouteEntity route = requireOwnRoute(actorId, routeId);
        route.setName(name.trim());
        route.setScheduleDay(scheduleDay);
        route.setScheduleTime(scheduleTime);
        // null = clear; otherwise resolve + validate.
        route.setRiderId(riderId == null ? null : requireOwnRider(actorId, riderId).getId());
        route.setVehicleId(vehicleId == null ? null : requireOwnActiveVehicle(actorId, vehicleId).getId());
        route.setSupervisorName(supervisorName == null ? null : supervisorName.trim());
        route.setSupervisorPhone(supervisorPhone == null ? null : supervisorPhone.trim());
        route.setUpdatedAt(Instant.now());
        DeliveryRouteEntity saved = routeRepository.save(route);
        return DeliveryRouteDto.from(
                saved,
                routeStopRepository.findByRouteIdOrderBySequenceAsc(saved.getId()),
                findRiderOrNull(saved.getRiderId()),
                findVehicleOrNull(saved.getVehicleId())
        );
    }

    /**
     * Replace the full ordered stop list of a route in one transaction.
     *
     * <p>Each input is just {@code sellerId} — the seller profile's real
     * {@code businessName}, {@code address}, {@code lat} and {@code lng}
     * are copied into the stop row so the map and the polyline are
     * drawn from authoritative data.</p>
     *
     * <p>A seller without valid coordinates is rejected with
     * {@link BadRequestException} rather than silently dropped or
     * coerced — the supplier must fix that seller (or remove it from the
     * route) before the route can be saved.</p>
     *
     * <p>Sequences are renumbered 1..N so the
     * {@code UNIQUE (route_id, sequence)} constraint can never trip on
     * the way out. Duplicates are rejected up front.</p>
     */
    @Transactional
    public DeliveryRouteDto replaceRouteStops(
            HttpServletRequest request,
            Long routeId,
            List<Long> sellerIds
    ) {
        Long actorId = requireSupplier(request);
        DeliveryRouteEntity route = requireOwnRoute(actorId, routeId);
        if (sellerIds == null) {
            throw new BadRequestException("sellerIds is required");
        }
        // De-dup while preserving order.
        List<Long> ordered = new ArrayList<>(new LinkedHashSet<>(sellerIds));
        if (ordered.isEmpty()) {
            throw new BadRequestException(
                    "A route must have at least one seller stop");
        }
        // Resolve every seller up front; missing profiles or missing
        // coordinates surface as a clear 400 before any write happens.
        java.util.Map<Long, SellerProfileEntity> profiles = new java.util.HashMap<>();
        for (Long sid : ordered) {
            if (sid == null) {
                throw new BadRequestException("sellerIds must not contain null");
            }
            SellerProfileEntity p = sellerProfileRepository.findById(sid)
                    .orElseThrow(() -> new BadRequestException(
                            "Seller " + sid + " not found"));
            if (p.getLat() == null || p.getLng() == null) {
                throw new BadRequestException(
                        "Seller " + sid + " (" + safeName(p) + ") has no coordinates. "
                                + "Add a location to the seller before including them on a route.");
            }
            profiles.put(sid, p);
        }
        // Wipe + rewrite — sequence renumbering keeps the unique
        // constraint happy without a per-row round trip.
        routeStopRepository.deleteByRouteId(routeId);
        routeStopRepository.flush();
        List<DeliveryRouteStopEntity> rows = new ArrayList<>(ordered.size());
        int seq = 1;
        for (Long sid : ordered) {
            SellerProfileEntity p = profiles.get(sid);
            DeliveryRouteStopEntity row = new DeliveryRouteStopEntity();
            row.setRouteId(route.getId());
            row.setSequence(seq++);
            row.setSellerId(p.getUserId());
            row.setSellerName(p.getBusinessName() == null ? "" : p.getBusinessName());
            row.setAddress(p.getAddress() == null ? "" : p.getAddress());
            row.setLat(p.getLat());
            row.setLng(p.getLng());
            rows.add(row);
        }
        routeStopRepository.saveAll(rows);
        route.setUpdatedAt(Instant.now());
        DeliveryRouteEntity saved = routeRepository.save(route);
        List<DeliveryRouteStopEntity> savedStops =
                routeStopRepository.findByRouteIdOrderBySequenceAsc(saved.getId());
        return DeliveryRouteDto.from(
                saved,
                savedStops,
                findRiderOrNull(saved.getRiderId()),
                findVehicleOrNull(saved.getVehicleId())
        );
    }

    private static String safeName(SellerProfileEntity p) {
        String n = p.getBusinessName();
        return n == null || n.isBlank() ? String.valueOf(p.getUserId()) : n;
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

    /* ---------------- Supplier ↔ Rider (V19) ---------------- */

    /**
     * List the riders the supplier has explicitly assigned to their
     * company. The full {@link RiderProfileDto} is returned so the
     * mobile client can render the picker without an extra round-trip
     * to {@code /api/riders}.
     */
    @Transactional(readOnly = true)
    public List<RiderProfileDto> listSupplierRiders(Long supplierId) {
        List<Long> riderIds = supplierRiderRepository.findRiderIdsBySupplierId(supplierId);
        if (riderIds.isEmpty()) {
            return List.of();
        }
        // Only active rider profiles are returned — the mobile picker
        // shows "available riders only" and the inactive rows would
        // never be selectable.
        java.util.List<RiderProfileDto> out = new java.util.ArrayList<>(riderIds.size());
        for (Long riderId : riderIds) {
            riderProfileRepository.findById(riderId).ifPresent(profile -> {
                User u = userRepository.findById(riderId).orElse(null);
                if (u != null && u.isActive()) {
                    out.add(RiderProfileDto.from(profile, u));
                }
            });
        }
        return out;
    }

    /**
     * Add a rider to the supplier's company roster. The rider must
     * already be a {@code RIDER} user (the system has no other rider
     * source) and must be active. Re-adding the same rider is a no-op.
     */
    @Transactional
    public void linkSupplierRider(Long supplierId, Long riderId) {
        requireOwnRider(supplierId, riderId); // throws if not eligible
        if (!supplierRiderRepository.existsBySupplierIdAndRiderId(supplierId, riderId)) {
            supplierRiderRepository.save(new SupplierRiderEntity(supplierId, riderId));
        }
    }

    /**
     * Remove a rider from the supplier's roster. Idempotent — silently
     * succeeds when the link doesn't exist so the toggle on the Fleet
     * screen can be a "fire and forget" interaction.
     */
    @Transactional
    public void unlinkSupplierRider(Long supplierId, Long riderId) {
        if (riderId == null) {
            throw new BadRequestException("riderId is required");
        }
        supplierRiderRepository.deleteById(new SupplierRiderEntity.PK(supplierId, riderId));
    }

    /**
     * Create a brand-new {@code RIDER} user that belongs to the supplier
     * by construction.
     *
     * <p>Business rule: the <strong>supplier</strong> creates and owns
     * their riders directly. Admin is read-only on this surface. The
     * rider is a "managed identity" — there is no self-registration
     * step, so we mint a placeholder username + email (both unique on
     * {@code users}) and a random unusable password hash. The supplier
     * never needs to log in as the rider.</p>
     *
     * <p>Three writes happen in one transaction:</p>
     * <ol>
     *   <li>{@code users} row with {@code role=RIDER} and
     *       {@code active=true}.</li>
     *   <li>{@code rider_profiles} row keyed by the new
     *       {@code user_id}, copying phone / vehicle / license info
     *       from the request.</li>
     *   <li>{@code supplier_riders(supplierId, newUserId)} so the
     *       canonical {@link #requireOwnRider} guard accepts the new
     *       rider on the very next route write.</li>
     * </ol>
     *
     * <p>The returned {@link RiderProfileDto} carries the real numeric
     * id (e.g. {@code "27"}) — never a synthetic
     * {@code rider-${Date.now()}} placeholder. The mobile client drops
     * that id directly into {@code riderId} on the Add Route payload.</p>
     */
    @Transactional
    public RiderProfileDto createSupplierRider(
            HttpServletRequest request,
            String fullName,
            String phone,
            String licenseNo,
            String vehicleType,
            String vehiclePlate,
            String vehicleModel
    ) {
        Long actorId = requireSupplier(request);
        if (fullName == null || fullName.isBlank()) {
            throw new BadRequestException("fullName is required");
        }
        if (fullName.length() > 120) {
            throw new BadRequestException(
                    "fullName must be 120 characters or fewer.");
        }
        // The riders created here are managed identities — no public
        // email/username is required, but the schema's UNIQUE
        // constraints still need values that will not collide.
        // We mint `supplier-{actorId}-rider-{uuid}` for both username
        // and email (with a placeholder domain), guaranteeing uniqueness
        // without the supplier typing anything.
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        String username = "supplier-" + actorId + "-rider-" + suffix;
        String email = username + "@supplier-riders.local";
        // Random unusable password hash so the row can never be logged
        // into as a regular rider account. The supplier creates these
        // riders on behalf of their company; the rider logs in via
        // the rider app with their own credentials later if/when
        // applicable (out of scope for this flow).
        String passwordHash = passwordEncoder.encode(UUID.randomUUID().toString());

        User user = new User(
                fullName.trim(),
                username,
                email,
                passwordHash,
                phone == null ? null : phone.trim(),
                Role.RIDER
        );
        user.setActive(true);
        User saved = userRepository.save(user);

        RiderProfileEntity profile = new RiderProfileEntity(
                saved.getId(),
                vehicleType == null || vehicleType.isBlank()
                        ? "motorcycle" : vehicleType.trim(),
                vehiclePlate == null ? null : vehiclePlate.trim(),
                vehicleModel == null ? null : vehicleModel.trim(),
                licenseNo == null ? null : licenseNo.trim(),
                true,
                phone == null ? null : phone.trim(),
                null,
                null,
                null,
                null,
                null,
                null
        );
        riderProfileRepository.save(profile);

        supplierRiderRepository.save(new SupplierRiderEntity(actorId, saved.getId()));

        return RiderProfileDto.from(profile, saved);
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

    /**
     * Canonical "rider belongs to this supplier's company" guard. The
     * rider must exist, be a {@code RIDER}, be active, AND have a row
     * in {@code supplier_riders(supplierId, riderId)}. The
     * {@link com.project.gas_delivery.supplier.service.SupplierTripService}
     * trip-create path calls this same guard so the route and the trip
     * can't disagree on rider membership.
     *
     * <p>Returns the joined {@link User} so callers can read the
     * denormalised name without an extra round-trip.</p>
     */
    public User requireOwnRider(Long supplierId, Long riderId) {
        if (riderId == null) {
            throw new BadRequestException("riderId is required");
        }
        User u = userRepository.findById(riderId)
                .orElseThrow(() -> new BadRequestException("Rider not found."));
        if (u.getRole() != Role.RIDER) {
            throw new BadRequestException("Selected user is not a rider.");
        }
        if (!u.isActive()) {
            throw new BadRequestException("Rider is not active.");
        }
        if (!supplierRiderRepository.existsBySupplierIdAndRiderId(supplierId, riderId)) {
            throw new BadRequestException(
                    "Rider does not belong to this supplier.");
        }
        return u;
    }

    /**
     * Active-vehicle ownership guard. Mirrors the inline check in
     * {@code SupplierTripService.createTrip} so the route and the trip
     * agree on what "available vehicle" means.
     */
    public SupplierVehicleEntity requireOwnActiveVehicle(Long supplierId, Long vehicleId) {
        if (vehicleId == null) {
            throw new BadRequestException("vehicleId is required");
        }
        SupplierVehicleEntity v = vehicleRepository.findById(vehicleId)
                .orElseThrow(() -> new BadRequestException("Vehicle not found."));
        if (!v.getSupplierId().equals(supplierId)) {
            throw new BadRequestException(
                    "Vehicle does not belong to this supplier.");
        }
        if (!v.isActive()) {
            throw new BadRequestException("Vehicle is not active.");
        }
        return v;
    }

    /**
     * Validates the free-text Supervisor name + phone. A blank name is
     * rejected; the phone is checked against a relaxed E.164-ish
     * regex so local formats like {@code +255 7XX XXX XXX} pass.
     */
    private static void validateSupervisor(String name, String phone) {
        if (name == null || name.isBlank()) {
            throw new BadRequestException("supervisorName is required.");
        }
        if (name.length() > 120) {
            throw new BadRequestException(
                    "supervisorName must be 120 characters or fewer.");
        }
        if (phone == null || phone.isBlank()) {
            throw new BadRequestException("supervisorPhone is required.");
        }
        if (!PHONE_PATTERN.matcher(phone).matches()) {
            throw new BadRequestException(
                    "supervisorPhone must be a valid phone number.");
        }
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

    /**
     * Resolve an optional rider id against the supplier's roster. Returns
     * {@code null} when the id is null (no rider assigned). Throws when
     * the id is supplied but doesn't pass {@link #requireOwnRider}.
     */
    private User resolveRider(Long supplierId, Long riderId) {
        return riderId == null ? null : requireOwnRider(supplierId, riderId);
    }

    /**
     * Resolve an optional vehicle id against the supplier's fleet.
     * Returns {@code null} when the id is null. Throws when supplied
     * but doesn't pass {@link #requireOwnActiveVehicle}.
     */
    private SupplierVehicleEntity resolveVehicle(Long supplierId, Long vehicleId) {
        return vehicleId == null ? null : requireOwnActiveVehicle(supplierId, vehicleId);
    }

    /** Quietly looks up a rider, returning {@code null} if missing. */
    private User findRiderOrNull(Long riderId) {
        if (riderId == null) return null;
        return userRepository.findById(riderId).orElse(null);
    }

    /** Quietly looks up a vehicle, returning {@code null} if missing. */
    private SupplierVehicleEntity findVehicleOrNull(Long vehicleId) {
        if (vehicleId == null) return null;
        return vehicleRepository.findById(vehicleId).orElse(null);
    }
}
