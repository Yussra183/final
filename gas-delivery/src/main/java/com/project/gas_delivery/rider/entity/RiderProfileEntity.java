package com.project.gas_delivery.rider.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Objects;

/**
 * 1:1 extension of {@code users} for rider-role rows.
 *
 * <p>Carries the motorcycle details (vehicle type, plate, model),
 * license number, and the {@code available} flag the rider toggles on
 * their dashboard when going on/off shift.</p>
 */
@Entity
@Table(name = "rider_profiles")
public class RiderProfileEntity {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "vehicle_type", nullable = false, length = 40)
    private String vehicleType = "motorcycle";

    @Column(name = "vehicle_plate", length = 40)
    private String vehiclePlate;

    @Column(name = "vehicle_model", length = 80)
    private String vehicleModel;

    @Column(name = "license_no", length = 80)
    private String licenseNo;

    @Column(name = "available", nullable = false)
    private boolean available = true;

    @Column(name = "phone", length = 30)
    private String phone;

    @Column(name = "lat")
    private Double lat;

    @Column(name = "lng")
    private Double lng;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected RiderProfileEntity() {
    }

    public RiderProfileEntity(Long userId, String vehicleType, String vehiclePlate,
                              String vehicleModel, String licenseNo,
                              boolean available, String phone, Double lat, Double lng) {
        this.userId = userId;
        this.vehicleType = vehicleType == null ? "motorcycle" : vehicleType;
        this.vehiclePlate = vehiclePlate;
        this.vehicleModel = vehicleModel;
        this.licenseNo = licenseNo;
        this.available = available;
        this.phone = phone;
        this.lat = lat;
        this.lng = lng;
    }

    @jakarta.persistence.PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (this.createdAt == null) this.createdAt = now;
        this.updatedAt = now;
    }

    @jakarta.persistence.PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    // --- Getters & Setters ---

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getVehicleType() {
        return vehicleType;
    }

    public void setVehicleType(String vehicleType) {
        this.vehicleType = vehicleType;
    }

    public String getVehiclePlate() {
        return vehiclePlate;
    }

    public void setVehiclePlate(String vehiclePlate) {
        this.vehiclePlate = vehiclePlate;
    }

    public String getVehicleModel() {
        return vehicleModel;
    }

    public void setVehicleModel(String vehicleModel) {
        this.vehicleModel = vehicleModel;
    }

    public String getLicenseNo() {
        return licenseNo;
    }

    public void setLicenseNo(String licenseNo) {
        this.licenseNo = licenseNo;
    }

    public boolean isAvailable() {
        return available;
    }

    public void setAvailable(boolean available) {
        this.available = available;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public Double getLat() {
        return lat;
    }

    public void setLat(Double lat) {
        this.lat = lat;
    }

    public Double getLng() {
        return lng;
    }

    public void setLng(Double lng) {
        this.lng = lng;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof RiderProfileEntity other)) return false;
        return Objects.equals(userId, other.userId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId);
    }
}