package com.project.gas_delivery.supplier.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.supplier.dto.DeliveryTripDto;
import com.project.gas_delivery.supplier.entity.DeliveryRouteEntity;
import com.project.gas_delivery.supplier.entity.DeliveryRouteStopEntity;
import com.project.gas_delivery.supplier.entity.DeliveryTripEntity;
import com.project.gas_delivery.supplier.entity.DeliveryTripStopEntity;
import com.project.gas_delivery.supplier.entity.SupplierVehicleEntity;
import com.project.gas_delivery.supplier.enums.DeliveryTripStatus;
import com.project.gas_delivery.supplier.repository.DeliveryRouteRepository;
import com.project.gas_delivery.supplier.repository.DeliveryRouteStopRepository;
import com.project.gas_delivery.supplier.repository.DeliveryTripRepository;
import com.project.gas_delivery.supplier.repository.DeliveryTripStopRepository;
import com.project.gas_delivery.supplier.repository.SupplierVehicleRepository;
import com.project.gas_delivery.tracking.service.DeliveryTrackingService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Supplier delivery-operation (trip) lifecycle.
 *
 * <p>A trip is a single execution of a {@link DeliveryRouteEntity} with a
 * concrete rider / vehicle / supervisor. The trip owns its own
 * snapshotted stops so editing the route after the trip has started
 * does not disturb the running operation.</p>
 *
 * <p>Authorization is re-checked from the entity on every write, so a
 * supplier can never act on another supplier's trip even if they guess
 * an id.</p>
 */
@Service
public class SupplierTripService {

    private final DeliveryTripRepository tripRepository;
    private final DeliveryTripStopRepository tripStopRepository;
    private final DeliveryRouteRepository routeRepository;
    private final DeliveryRouteStopRepository routeStopRepository;
    private final SupplierVehicleRepository vehicleRepository;
    private final UserRepository userRepository;
    private final DeliveryTrackingService trackingService;
    private final SupplierLogisticsService logisticsService;

    public SupplierTripService(
            DeliveryTripRepository tripRepository,
            DeliveryTripStopRepository tripStopRepository,
            DeliveryRouteRepository routeRepository,
            DeliveryRouteStopRepository routeStopRepository,
            SupplierVehicleRepository vehicleRepository,
            UserRepository userRepository,
            DeliveryTrackingService trackingService,
            SupplierLogisticsService logisticsService
    ) {
        this.tripRepository = tripRepository;
        this.tripStopRepository = tripStopRepository;
        this.routeRepository = routeRepository;
        this.routeStopRepository = routeStopRepository;
        this.vehicleRepository = vehicleRepository;
        this.userRepository = userRepository;
        this.trackingService = trackingService;
        this.logisticsService = logisticsService;
    }

    /* ---------------- Reads ---------------- */

    /**
     * Convenience for the controller: validate the actor and return the
     * supplier id, so a controller can refuse unauthenticated callers
     * before any list query runs.
     */
    public Long requireSupplierId(HttpServletRequest request) {
        return requireSupplier(request);
    }

    @Transactional(readOnly = true)
    public List<DeliveryTripDto> listTripsForSupplier(
            Long supplierId,
            DeliveryTripStatus status
    ) {
        List<DeliveryTripEntity> trips = status == null
                ? tripRepository.findBySupplierIdOrderByCreatedAtDesc(supplierId)
                : tripRepository.findBySupplierIdAndStatusOrderByCreatedAtDesc(supplierId, status);
        List<DeliveryTripDto> out = new ArrayList<>(trips.size());
        for (DeliveryTripEntity t : trips) {
            out.add(toDto(t));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public DeliveryTripDto getTrip(HttpServletRequest request, Long tripId) {
        Long actorId = requireSupplier(request);
        DeliveryTripEntity trip = requireOwnTrip(actorId, tripId);
        return toDto(trip);
    }

    /* ---------------- Writes ---------------- */

    /**
     * Create a trip in {@code PLANNED} state from a route's current
     * stop list. The supplier must pick a rider, vehicle and supervisor
     * (free-text name + phone — there is no supervisor role in the
     * system) on the Start Delivery screen.
     */
    @Transactional
    public DeliveryTripDto createTrip(
            HttpServletRequest request,
            Long routeId,
            Long riderId,
            Long vehicleId,
            String supervisorName,
            String supervisorPhone
    ) {
        Long actorId = requireSupplier(request);
        if (supervisorName == null || supervisorName.isBlank()) {
            throw new BadRequestException("supervisorName is required");
        }
        if (supervisorPhone == null || supervisorPhone.isBlank()) {
            throw new BadRequestException("supervisorPhone is required");
        }
        DeliveryRouteEntity route = requireOwnRoute(actorId, routeId);

        // V19 — default the crew from the route row when the supplier
        // didn't override any of them at Start time. The route is the
        // durable source; the trip is a per-instance execution that may
        // still override. A null override + null route value is allowed
        // (the trip simply records no rider/vehicle).
        if (supervisorName == null || supervisorName.isBlank()) {
            supervisorName = route.getSupervisorName();
        }
        if (supervisorPhone == null || supervisorPhone.isBlank()) {
            supervisorPhone = route.getSupervisorPhone();
        }
        if (riderId == null && route.getRiderId() != null) {
            riderId = route.getRiderId();
        }
        if (vehicleId == null && route.getVehicleId() != null) {
            vehicleId = route.getVehicleId();
        }

        // A route with zero stops is an invalid trip — the supplier must
        // add sellers before they can run a delivery.
        List<DeliveryRouteStopEntity> routeStops =
                routeStopRepository.findByRouteIdOrderBySequenceAsc(route.getId());
        if (routeStops.isEmpty()) {
            throw new BadRequestException(
                    "Route has no sellers. Add sellers before starting a delivery.");
        }
        // Vehicle: must belong to this supplier and be active. Uses the
        // shared {@link SupplierLogisticsService#requireOwnActiveVehicle}
        // guard so the route and trip agree on what "available" means.
        SupplierVehicleEntity vehicle = null;
        if (vehicleId != null) {
            vehicle = logisticsService.requireOwnActiveVehicle(actorId, vehicleId);
        }
        // Rider: V19 tightened the loose check. The rider must exist, be
        // a RIDER, be active, AND have a row in supplier_riders for this
        // supplier. Same {@code requireOwnRider} guard as the route
        // create/update path — the supplier cannot attach a foreign
        // rider by guessing an id.
        String riderName = null;
        if (riderId != null) {
            User rider = logisticsService.requireOwnRider(actorId, riderId);
            riderName = rider.getFullName();
        }

        // Reject if this route already has a non-terminal trip. The
        // partial unique index is a backstop, but a clear 400 helps the
        // supplier understand what went wrong.
        Optional<DeliveryTripEntity> existing =
                tripRepository.findFirstByRouteIdAndStatus(route.getId(), DeliveryTripStatus.ACTIVE);
        if (existing.isPresent()) {
            throw new BadRequestException(
                    "This route already has an active delivery.");
        }

        DeliveryTripEntity trip = new DeliveryTripEntity();
        trip.setSupplierId(actorId);
        trip.setRouteId(route.getId());
        trip.setRouteName(route.getName());
        trip.setScheduleDay(route.getScheduleDay());
        trip.setRiderId(riderId);
        trip.setRiderName(riderName);
        trip.setVehicleId(vehicle == null ? null : vehicle.getId());
        trip.setVehiclePlate(vehicle == null ? null : vehicle.getPlate());
        trip.setSupervisorName(supervisorName.trim());
        trip.setSupervisorPhone(supervisorPhone.trim());
        trip.setStatus(DeliveryTripStatus.PLANNED);
        DeliveryTripEntity saved = tripRepository.save(trip);

        // Snapshot the route's stops at create-time so a later route
        // edit doesn't move the goalposts on a draft trip either.
        List<DeliveryTripStopEntity> snapshot = new ArrayList<>(routeStops.size());
        int seq = 1;
        for (DeliveryRouteStopEntity s : routeStops) {
            DeliveryTripStopEntity row = new DeliveryTripStopEntity();
            row.setTripId(saved.getId());
            row.setSequence(seq++);
            row.setSellerId(s.getSellerId());
            row.setSellerName(s.getSellerName());
            row.setAddress(s.getAddress());
            row.setLat(s.getLat());
            row.setLng(s.getLng());
            row.setStatus("scheduled");
            snapshot.add(row);
        }
        tripStopRepository.saveAll(snapshot);
        return toDto(saved);
    }

    /**
     * Transition {@code PLANNED → ACTIVE}. The route's stops are already
     * snapshotted at create-time, so this is just a status flip plus a
     * timestamp — the supplier can start the trip without re-typing
     * anything.
     *
     * <p>This is also the gate the seller-side tracking channel reads:
     * no GPS sample is broadcast before the trip is ACTIVE.</p>
     */
    @Transactional
    public DeliveryTripDto startTrip(HttpServletRequest request, Long tripId) {
        Long actorId = requireSupplier(request);
        DeliveryTripEntity trip = requireOwnTrip(actorId, tripId);
        if (!trip.getStatus().canTransitionTo(DeliveryTripStatus.ACTIVE)) {
            throw new BadRequestException(
                    "Trip in state " + trip.getStatus().toJson()
                            + " cannot be started.");
        }
        trip.setStatus(DeliveryTripStatus.ACTIVE);
        trip.setStartedAt(Instant.now());
        trip.setUpdatedAt(Instant.now());
        DeliveryTripEntity saved = tripRepository.save(trip);
        return toDto(saved);
    }

    /**
     * Mark a trip completed and drop any cached live position so the
     * map stops receiving updates.
     */
    @Transactional
    public DeliveryTripDto completeTrip(HttpServletRequest request, Long tripId) {
        Long actorId = requireSupplier(request);
        DeliveryTripEntity trip = requireOwnTrip(actorId, tripId);
        if (!trip.getStatus().canTransitionTo(DeliveryTripStatus.COMPLETED)) {
            throw new BadRequestException(
                    "Trip in state " + trip.getStatus().toJson()
                            + " cannot be completed.");
        }
        trip.setStatus(DeliveryTripStatus.COMPLETED);
        trip.setCompletedAt(Instant.now());
        trip.setUpdatedAt(Instant.now());
        DeliveryTripEntity saved = tripRepository.save(trip);
        // Drop the cached GPS sample so post-completion snapshots can't
        // surface through the trip channel.
        trackingService.clearOnTrip(saved.getId());
        return toDto(saved);
    }

    /**
     * Mark one stop delivered. Sequence is preserved; only that row's
     * status + deliveredAt flip. This is the seller-facing handshake
     * the Start Delivery screen's CTA eventually drives.
     */
    @Transactional
    public DeliveryTripDto markStopDelivered(
            HttpServletRequest request,
            Long tripId,
            Long sellerId
    ) {
        Long actorId = requireSupplier(request);
        DeliveryTripEntity trip = requireOwnTrip(actorId, tripId);
        List<DeliveryTripStopEntity> stops =
                tripStopRepository.findByTripIdOrderBySequenceAsc(trip.getId());
        DeliveryTripStopEntity target = null;
        for (DeliveryTripStopEntity s : stops) {
            if (sellerId == null
                    ? s.getSellerId() == null
                    : sellerId.equals(s.getSellerId())) {
                target = s;
                break;
            }
        }
        if (target == null) {
            throw new BadRequestException(
                    "Seller " + sellerId + " is not on this trip.");
        }
        target.setStatus("delivered");
        target.setDeliveredAt(Instant.now());
        tripStopRepository.save(target);
        trip.setUpdatedAt(Instant.now());
        tripRepository.save(trip);
        return toDto(trip);
    }

    /* ---------------- Helpers ---------------- */

    private DeliveryTripDto toDto(DeliveryTripEntity trip) {
        List<DeliveryTripStopEntity> stops =
                tripStopRepository.findByTripIdOrderBySequenceAsc(trip.getId());
        return DeliveryTripDto.from(trip, stops);
    }

    private Long requireSupplier(HttpServletRequest request) {
        Long actorId = AuthFilter.currentActorId(request);
        Role role = AuthFilter.currentActorRole(request);
        if (actorId == null || role == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        if (role != Role.SUPPLIER) {
            throw new NotAuthorizedException(
                    "Only suppliers can manage delivery operations.");
        }
        User user = userRepository.findById(actorId).orElse(null);
        if (user == null || !user.isActive()) {
            throw new NotAuthorizedException("Supplier account is inactive.");
        }
        return actorId;
    }

    private DeliveryTripEntity requireOwnTrip(Long supplierId, Long tripId) {
        DeliveryTripEntity trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new NotAuthorizedException("Trip not found."));
        if (!trip.getSupplierId().equals(supplierId)) {
            throw new NotAuthorizedException("Trip does not belong to this supplier.");
        }
        return trip;
    }

    private DeliveryRouteEntity requireOwnRoute(Long supplierId, Long routeId) {
        DeliveryRouteEntity route = routeRepository.findById(routeId)
                .orElseThrow(() -> new NotAuthorizedException("Route not found."));
        if (!route.getSupplierId().equals(supplierId)) {
            throw new NotAuthorizedException("Route does not belong to this supplier.");
        }
        return route;
    }
}