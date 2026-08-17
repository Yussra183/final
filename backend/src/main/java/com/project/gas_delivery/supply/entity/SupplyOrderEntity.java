package com.project.gas_delivery.supply.entity;

import com.project.gas_delivery.supply.enums.SupplyOrderStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Objects;

/**
 * Persistent record for a seller's gas supply request to a supplier
 * (FR-06).
 *
 * <p>The schema is single-row-per-order (no separate items table) because
 * supply orders always carry one product + size + quantity. The frontend
 * already models {@code RestockRequest} the same way, so the wire shape
 * is a clean 1:1 match.</p>
 *
 * <p>{@code supplierId} is nullable at insertion time so a seller can
 * raise an open PENDING order addressed to "any approved supplier" — the
 * backend assigns the supplier at the accept step. {@code productId} is
 * similarly optional (sellers sometimes order a generic LPG refill the
 * supplier fulfils from any of their own brands).</p>
 */
@Entity
@Table(
        name = "supply_orders",
        indexes = {
                @Index(name = "idx_supply_orders_supplier", columnList = "supplier_id, updated_at DESC"),
                @Index(name = "idx_supply_orders_seller",   columnList = "seller_id,   updated_at DESC"),
                @Index(name = "idx_supply_orders_status_updated", columnList = "status, updated_at DESC")
        }
)
public class SupplyOrderEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "seller_id", nullable = false)
    private Long sellerId;

    @Column(name = "seller_name", nullable = false, length = 120)
    private String sellerName;

    @Column(name = "supplier_id")
    private Long supplierId;

    @Column(name = "supplier_name", length = 120)
    private String supplierName;

    @Column(name = "product_name", nullable = false, length = 160)
    private String productName;

    @Column(name = "size", nullable = false, length = 40)
    private String size;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "product_id")
    private Long productId;

    @Column(name = "notes", length = 1000)
    private String notes;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private SupplyOrderStatus status;

    @Column(name = "reject_reason", length = 500)
    private String rejectReason;

    @Column(name = "dispatched_at")
    private Instant dispatchedAt;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    @Column(name = "received_at")
    private Instant receivedAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "cancelled_by_role", length = 20)
    private String cancelledByRole;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** JPA requires a no-arg constructor. */
    protected SupplyOrderEntity() {
    }

    public SupplyOrderEntity(Long sellerId, String sellerName,
                             Long supplierId, String supplierName,
                             String productName, String size, int quantity,
                             Long productId, String notes) {
        this.sellerId = sellerId;
        this.sellerName = sellerName;
        this.supplierId = supplierId;
        this.supplierName = supplierName;
        this.productName = productName;
        this.size = size;
        this.quantity = quantity;
        this.productId = productId;
        this.notes = notes;
        this.status = SupplyOrderStatus.PENDING;
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

    public Long getId() { return id; }

    public Long getSellerId() { return sellerId; }
    public void setSellerId(Long sellerId) { this.sellerId = sellerId; }

    public String getSellerName() { return sellerName; }
    public void setSellerName(String sellerName) { this.sellerName = sellerName; }

    public Long getSupplierId() { return supplierId; }
    public void setSupplierId(Long supplierId) { this.supplierId = supplierId; }

    public String getSupplierName() { return supplierName; }
    public void setSupplierName(String supplierName) { this.supplierName = supplierName; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }

    public String getSize() { return size; }
    public void setSize(String size) { this.size = size; }

    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public SupplyOrderStatus getStatus() { return status; }
    public void setStatus(SupplyOrderStatus status) { this.status = status; }

    public String getRejectReason() { return rejectReason; }
    public void setRejectReason(String rejectReason) { this.rejectReason = rejectReason; }

    public Instant getDispatchedAt() { return dispatchedAt; }
    public void setDispatchedAt(Instant dispatchedAt) { this.dispatchedAt = dispatchedAt; }

    public Instant getDeliveredAt() { return deliveredAt; }
    public void setDeliveredAt(Instant deliveredAt) { this.deliveredAt = deliveredAt; }

    public Instant getReceivedAt() { return receivedAt; }
    public void setReceivedAt(Instant receivedAt) { this.receivedAt = receivedAt; }

    public Instant getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(Instant cancelledAt) { this.cancelledAt = cancelledAt; }

    public String getCancelledByRole() { return cancelledByRole; }
    public void setCancelledByRole(String cancelledByRole) { this.cancelledByRole = cancelledByRole; }

    public Instant getCreatedAt() { return createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SupplyOrderEntity other)) return false;
        return id != null && Objects.equals(id, other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
