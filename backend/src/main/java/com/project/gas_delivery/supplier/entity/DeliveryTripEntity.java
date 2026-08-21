package com.project.gas_delivery.supplier.entity;

import com.project.gas_delivery.supplier.enums.DeliveryTripStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * One execution of a {@link DeliveryRouteEntity} — the supplier's
 * "Delivery Operation".
 *
 * <p>Where the route is the recurring <em>plan</em> ("Tunguu Route, every
 * Monday at 05:00"), a trip is a single <em>run</em> of that plan with a
 * concrete rider, vehicle and supervisor, moving through
 * {@link DeliveryTripStatus}. The route name and schedule day are
 * denormalised onto the row so historical trips still read correctly
 * after the route is renamed or rescheduled.</p>
 *
 * <p>The stops the trip actually serves live in
 * {@link DeliveryTripStopEntity}, snapshotted when the trip starts, so
 * editing the underlying route never disturbs a delivery already on the
 * road.</p>
 */
@Entity
@Table(name = "delivery_trips")
public class DeliveryTripEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "supplier_id", nullable = false)
    private Long supplierId;

    @Column(name = "route_id", nullable = false)
    private Long routeId;

    @Column(name = "route_name", nullable = false, length = 120)
    private String routeName;

    @Column(name = "schedule_day", nullable = false, length = 3)
    private String scheduleDay;

    @Column(name = "rider_id")
    private Long riderId;

    @Column(name = "rider_name", length = 120)
    private String riderName;

    @Column(name = "vehicle_id")
    private Long vehicleId;

    @Column(name = "vehicle_plate", length = 40)
    private String vehiclePlate;

    /**
     * Free-text supervisor. Deliberately not a FK — this system has no
     * supervisor role, and the person supervising a run is simply
     * somebody at the supply company.
     */
    @Column(name = "supervisor_name", length = 120)
    private String supervisorName;

    @Column(name = "supervisor_phone", length = 30)
    private String supervisorPhone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private DeliveryTripStatus status = DeliveryTripStatus.PLANNED;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getSupplierId() { return supplierId; }
    public void setSupplierId(Long supplierId) { this.supplierId = supplierId; }
    public Long getRouteId() { return routeId; }
    public void setRouteId(Long routeId) { this.routeId = routeId; }
    public String getRouteName() { return routeName; }
    public void setRouteName(String routeName) { this.routeName = routeName; }
    public String getScheduleDay() { return scheduleDay; }
    public void setScheduleDay(String scheduleDay) { this.scheduleDay = scheduleDay; }
    public Long getRiderId() { return riderId; }
    public void setRiderId(Long riderId) { this.riderId = riderId; }
    public String getRiderName() { return riderName; }
    public void setRiderName(String riderName) { this.riderName = riderName; }
    public Long getVehicleId() { return vehicleId; }
    public void setVehicleId(Long vehicleId) { this.vehicleId = vehicleId; }
    public String getVehiclePlate() { return vehiclePlate; }
    public void setVehiclePlate(String vehiclePlate) { this.vehiclePlate = vehiclePlate; }
    public String getSupervisorName() { return supervisorName; }
    public void setSupervisorName(String supervisorName) { this.supervisorName = supervisorName; }
    public String getSupervisorPhone() { return supervisorPhone; }
    public void setSupervisorPhone(String supervisorPhone) { this.supervisorPhone = supervisorPhone; }
    public DeliveryTripStatus getStatus() { return status; }
    public void setStatus(DeliveryTripStatus status) { this.status = status; }
    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
