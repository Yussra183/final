package com.project.gas_delivery.permit.entity;

import com.project.gas_delivery.permit.enums.PermitStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Objects;

/**
 * 1:1 lifecycle row for a seller's permit application.
 *
 * <p>A permit exists for every seller whose {@code role = SELLER}. Newly
 * registered sellers get a {@link PermitStatus#PENDING} row created
 * automatically; on admin approval the application transitions to
 * {@link PermitStatus#APPROVED} and the owning {@code users.is_active} flag
 * is flipped to {@code true} so customer and rider queries start returning
 * the seller.</p>
 *
 * <p>The V4 migration enforces a UNIQUE constraint on {@code seller_id}, so
 * the same seller can only ever have one permit row at a time — re-submission
 * after a rejection re-uses the same row.</p>
 */
@Entity
@Table(name = "seller_permits")
public class SellerPermitEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "seller_id", nullable = false, unique = true)
    private Long sellerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PermitStatus status = PermitStatus.PENDING;

    @Column(name = "business_name", nullable = false, length = 160)
    private String businessName;

    @Column(name = "rejection_reason", columnDefinition = "TEXT")
    private String rejectionReason;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "reviewed_by")
    private Long reviewedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected SellerPermitEntity() {
    }

    public SellerPermitEntity(Long sellerId, String businessName) {
        this.sellerId = sellerId;
        this.businessName = businessName;
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

    // --- getters / setters ---

    public Long getId() {
        return id;
    }

    public Long getSellerId() {
        return sellerId;
    }

    public void setSellerId(Long sellerId) {
        this.sellerId = sellerId;
    }

    public PermitStatus getStatus() {
        return status;
    }

    public void setStatus(PermitStatus status) {
        this.status = status;
    }

    public String getBusinessName() {
        return businessName;
    }

    public void setBusinessName(String businessName) {
        this.businessName = businessName;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public void setSubmittedAt(Instant submittedAt) {
        this.submittedAt = submittedAt;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }

    public void setReviewedAt(Instant reviewedAt) {
        this.reviewedAt = reviewedAt;
    }

    public Long getReviewedBy() {
        return reviewedBy;
    }

    public void setReviewedBy(Long reviewedBy) {
        this.reviewedBy = reviewedBy;
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
        if (!(o instanceof SellerPermitEntity other)) return false;
        return id != null && Objects.equals(id, other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
