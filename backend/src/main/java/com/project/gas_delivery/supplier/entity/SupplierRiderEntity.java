package com.project.gas_delivery.supplier.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * Join entity for the {@code supplier_riders} many-to-many assignment
 * (V19).
 *
 * <p>Composite PK {@code (supplier_id, rider_id)}. Mirrors the existing
 * {@code seller_riders} join {@code (seller_id, rider_id)} structurally
 * but is owned by the supplier module — it expresses which riders
 * belong to a supplier's company, not which riders are dispatched to
 * a particular seller. Order dispatch continues to use
 * {@code seller_riders}.</p>
 */
@Entity
@Table(name = "supplier_riders")
@IdClass(SupplierRiderEntity.PK.class)
public class SupplierRiderEntity {

    @Id
    @Column(name = "supplier_id")
    private Long supplierId;

    @Id
    @Column(name = "rider_id")
    private Long riderId;

    @Column(name = "assigned_at", nullable = false, updatable = false)
    private Instant assignedAt;

    protected SupplierRiderEntity() {
    }

    public SupplierRiderEntity(Long supplierId, Long riderId) {
        this.supplierId = supplierId;
        this.riderId = riderId;
    }

    @jakarta.persistence.PrePersist
    void onCreate() {
        if (this.assignedAt == null) this.assignedAt = Instant.now();
    }

    public Long getSupplierId() {
        return supplierId;
    }

    public Long getRiderId() {
        return riderId;
    }

    public Instant getAssignedAt() {
        return assignedAt;
    }

    /** Composite primary key class — required by {@code @IdClass}. */
    public static class PK implements Serializable {
        private Long supplierId;
        private Long riderId;

        public PK() {
        }

        public PK(Long supplierId, Long riderId) {
            this.supplierId = supplierId;
            this.riderId = riderId;
        }

        public Long getSupplierId() {
            return supplierId;
        }

        public void setSupplierId(Long supplierId) {
            this.supplierId = supplierId;
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
            return Objects.equals(supplierId, pk.supplierId)
                    && Objects.equals(riderId, pk.riderId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(supplierId, riderId);
        }
    }
}
