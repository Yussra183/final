package com.project.gas_delivery.supplier.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * One recurring delivery route owned by a supplier.
 *
 * <p>Mirrors the frontend's {@code DeliveryRoute} interface in
 * {@code constants/types.ts}. A route has a name, a weekly
 * {@code scheduleDay} ("Mon".."Sun") and a {@code scheduleTime} ("HH:MM")
 * pair, plus the ordered list of {@link DeliveryRouteStopEntity} rows
 * that hang off it. The polyline used by the live map is derived from
 * the ordered stop list.</p>
 */
@Entity
@Table(name = "delivery_routes")
public class DeliveryRouteEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "supplier_id", nullable = false)
    private Long supplierId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "schedule_day", nullable = false, length = 3)
    private String scheduleDay;

    @Column(name = "schedule_time", nullable = false, length = 5)
    private String scheduleTime;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getSupplierId() { return supplierId; }
    public void setSupplierId(Long supplierId) { this.supplierId = supplierId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getScheduleDay() { return scheduleDay; }
    public void setScheduleDay(String scheduleDay) { this.scheduleDay = scheduleDay; }
    public String getScheduleTime() { return scheduleTime; }
    public void setScheduleTime(String scheduleTime) { this.scheduleTime = scheduleTime; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}