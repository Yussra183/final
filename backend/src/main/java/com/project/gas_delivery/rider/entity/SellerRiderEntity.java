package com.project.gas_delivery.rider.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * Join entity for the {@code seller_riders} many-to-many assignment.
 *
 * <p>Composite PK {@code (seller_id, rider_id)}. Used by
 * {@code OrderServiceImpl.availableForRiders} to filter the dispatch
 * queue so each rider only sees orders from their assigned sellers.</p>
 */
@Entity
@Table(name = "seller_riders")
@IdClass(SellerRiderEntity.PK.class)
public class SellerRiderEntity {

    @Id
    @Column(name = "seller_id")
    private Long sellerId;

    @Id
    @Column(name = "rider_id")
    private Long riderId;

    @Column(name = "assigned_at", nullable = false, updatable = false)
    private Instant assignedAt;

    protected SellerRiderEntity() {
    }

    public SellerRiderEntity(Long sellerId, Long riderId) {
        this.sellerId = sellerId;
        this.riderId = riderId;
    }

    @jakarta.persistence.PrePersist
    void onCreate() {
        if (this.assignedAt == null) this.assignedAt = Instant.now();
    }

    public Long getSellerId() {
        return sellerId;
    }

    public Long getRiderId() {
        return riderId;
    }

    public Instant getAssignedAt() {
        return assignedAt;
    }

    /** Composite primary key class — required by {@code @IdClass}. */
    public static class PK implements Serializable {
        private Long sellerId;
        private Long riderId;

        public PK() {
        }

        public PK(Long sellerId, Long riderId) {
            this.sellerId = sellerId;
            this.riderId = riderId;
        }

        public Long getSellerId() {
            return sellerId;
        }

        public void setSellerId(Long sellerId) {
            this.sellerId = sellerId;
        }

        public Long getRiderId() {
            return riderId;
        }

        public void setRiderId(Long riderId) {
            this.riderId = riderId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof PK pk)) return false;
            return Objects.equals(sellerId, pk.sellerId)
                    && Objects.equals(riderId, pk.riderId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(sellerId, riderId);
        }
    }
}