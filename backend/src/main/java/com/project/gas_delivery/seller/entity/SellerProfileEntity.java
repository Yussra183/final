package com.project.gas_delivery.seller.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Objects;

/**
 * 1:1 extension of {@code users} for seller-role rows.
 *
 * <p>Mirrors the frontend's {@code SellerProfile} interface
 * ({@code constants/types.ts}) — business name, address, lat/lng, rating,
 * available sizes, open-now flag.</p>
 *
 * <p>The user identity (full name, phone, role) still lives on
 * {@code auth.entity.User}; we only persist the seller-specific
 * fields here.</p>
 */
@Entity
@Table(name = "seller_profiles")
public class SellerProfileEntity {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "business_name", nullable = false, length = 160)
    private String businessName;

    @Column(name = "address", nullable = false, length = 500)
    private String address;

    @Column(name = "district", length = 120)
    private String district;

    @Column(name = "region", length = 120)
    private String region;

    @Column(name = "lat")
    private Double lat;

    @Column(name = "lng")
    private Double lng;

    @Column(name = "phone", length = 30)
    private String phone;

    @Column(name = "rating", nullable = false, precision = 3, scale = 2)
    private BigDecimal rating = BigDecimal.ZERO;

    @Column(name = "open_now", nullable = false)
    private boolean openNow = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected SellerProfileEntity() {
    }

    public SellerProfileEntity(Long userId, String businessName, String address,
                               String district, String region,
                               Double lat, Double lng,
                               String phone, BigDecimal rating, boolean openNow) {
        this.userId = userId;
        this.businessName = businessName;
        this.address = address;
        this.district = district;
        this.region = region;
        this.lat = lat;
        this.lng = lng;
        this.phone = phone;
        this.rating = rating == null ? BigDecimal.ZERO : rating;
        this.openNow = openNow;
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

    public String getBusinessName() {
        return businessName;
    }

    public void setBusinessName(String businessName) {
        this.businessName = businessName;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getDistrict() {
        return district;
    }

    public void setDistrict(String district) {
        this.district = district;
    }

    public String getRegion() {
        return region;
    }

    public void setRegion(String region) {
        this.region = region;
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

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public BigDecimal getRating() {
        return rating;
    }

    public void setRating(BigDecimal rating) {
        this.rating = rating;
    }

    public boolean isOpenNow() {
        return openNow;
    }

    public void setOpenNow(boolean openNow) {
        this.openNow = openNow;
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
        if (!(o instanceof SellerProfileEntity other)) return false;
        return Objects.equals(userId, other.userId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId);
    }
}