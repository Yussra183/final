package com.project.gas_delivery.customer.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Objects;

/**
 * 1:1 extension of {@code users} for customer-role rows — the persisted
 * home / delivery location of a customer.
 *
 * <p>Mirrors the "Location Information" card on the frontend's Customer
 * Profile screen ({@code app/(customer)/profile.tsx}): region, district,
 * ward, street, full address, plus the coordinates derived from them.</p>
 *
 * <p>The user identity (full name, phone, email, role) still lives on
 * {@code auth.entity.User}; only the location-specific fields are
 * persisted here. Same pattern as {@code SellerProfileEntity} and
 * {@code RiderProfileEntity}.</p>
 *
 * <p>{@code lat} / {@code lng} are nullable at the schema level but are
 * always written by {@code CustomerProfileService} — it geocodes the
 * address through {@code GeocodingService} whenever the client doesn't
 * supply explicit coordinates. That guarantee is what lets the customer
 * dashboard's "Nearby Sellers" pipeline always have a reference point to
 * sort against.</p>
 */
@Entity
@Table(name = "customer_profiles")
public class CustomerProfileEntity {

    /** PK and FK to {@code users.id} — one location row per customer. */
    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "region", length = 120)
    private String region;

    @Column(name = "district", length = 120)
    private String district;

    @Column(name = "ward", length = 120)
    private String ward;

    @Column(name = "street", length = 160)
    private String street;

    /**
     * The full, human-readable address. Either supplied verbatim by the
     * customer or composed from {@code street, ward, district, region}
     * — the same fallback the Profile screen shows as
     * "Will be saved as: …".
     */
    @Column(name = "address", length = 500)
    private String address;

    @Column(name = "lat")
    private Double lat;

    @Column(name = "lng")
    private Double lng;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** JPA requires a no-arg constructor. */
    protected CustomerProfileEntity() {
    }

    public CustomerProfileEntity(Long userId) {
        this.userId = userId;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (this.createdAt == null) this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
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

    public String getRegion() {
        return region;
    }

    public void setRegion(String region) {
        this.region = region;
    }

    public String getDistrict() {
        return district;
    }

    public void setDistrict(String district) {
        this.district = district;
    }

    public String getWard() {
        return ward;
    }

    public void setWard(String ward) {
        this.ward = ward;
    }

    public String getStreet() {
        return street;
    }

    public void setStreet(String street) {
        this.street = street;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
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
        if (!(o instanceof CustomerProfileEntity other)) return false;
        return Objects.equals(userId, other.userId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId);
    }
}
