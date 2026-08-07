package com.project.gas_delivery.order.entity;

import com.project.gas_delivery.order.enums.OrderStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * Persistent record for an Order in the gas-delivery platform.
 *
 * <p>The {@code items} field is stored as JSONB in PostgreSQL via
 * {@code @JdbcTypeCode(SqlTypes.JSON)}. Hibernate 6 / Spring Boot 4
 * round-trips it through Jackson automatically — no custom
 * {@code AttributeConverter} needed.</p>
 *
 * <p>Foreign-key columns are modelled as plain {@code Long} (no
 * {@code @ManyToOne} to {@code User}) so this module stays decoupled
 * from the auth module. The DB-level constraints in
 * {@code V2__create_orders_table.sql} guarantee referential integrity.</p>
 */
@Entity
@Table(
        name = "orders",
        indexes = {
                @Index(name = "idx_orders_customer", columnList = "customer_id, updated_at DESC"),
                @Index(name = "idx_orders_seller", columnList = "seller_id, updated_at DESC"),
                @Index(name = "idx_orders_rider", columnList = "rider_id, updated_at DESC"),
                @Index(name = "idx_orders_status_updated", columnList = "status, updated_at DESC")
        }
)
public class OrderEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "customer_id", nullable = false)
    private Long customerId;

    @Column(name = "customer_name", nullable = false, length = 120)
    private String customerName;

    @Column(name = "seller_id", nullable = false)
    private Long sellerId;

    @Column(name = "seller_name", nullable = false, length = 120)
    private String sellerName;

    @Column(name = "rider_id")
    private Long riderId;

    @Column(name = "rider_name", length = 120)
    private String riderName;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "items", columnDefinition = "jsonb", nullable = false)
    private List<OrderItemEmbeddable> items;

    @Column(name = "total", nullable = false, precision = 12, scale = 2)
    private BigDecimal total;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private OrderStatus status;

    @Column(name = "delivery_address", nullable = false, length = 500)
    private String deliveryAddress;

    @Column(name = "delivery_lat")
    private Double deliveryLat;

    @Column(name = "delivery_lng")
    private Double deliveryLng;

    @Column(name = "phone", length = 30)
    private String phone;

    @Column(name = "notes", length = 1000)
    private String notes;

    @Column(name = "reject_reason", length = 500)
    private String rejectReason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** JPA requires a no-arg constructor. */
    protected OrderEntity() {
    }

    public OrderEntity(Long customerId, String customerName,
                       Long sellerId, String sellerName,
                       List<OrderItemEmbeddable> items,
                       BigDecimal total,
                       String deliveryAddress) {
        this.customerId = customerId;
        this.customerName = customerName;
        this.sellerId = sellerId;
        this.sellerName = sellerName;
        this.items = items;
        this.total = total;
        this.status = OrderStatus.PENDING;
        this.deliveryAddress = deliveryAddress;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (this.createdAt == null) this.createdAt = now;
        this.updatedAt = now;
    }

    // --- Getters & Setters ---

    public Long getId() {
        return id;
    }

    public Long getCustomerId() {
        return customerId;
    }

    public void setCustomerId(Long customerId) {
        this.customerId = customerId;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
    }

    public Long getSellerId() {
        return sellerId;
    }

    public void setSellerId(Long sellerId) {
        this.sellerId = sellerId;
    }

    public String getSellerName() {
        return sellerName;
    }

    public void setSellerName(String sellerName) {
        this.sellerName = sellerName;
    }

    public Long getRiderId() {
        return riderId;
    }

    public void setRiderId(Long riderId) {
        this.riderId = riderId;
    }

    public String getRiderName() {
        return riderName;
    }

    public void setRiderName(String riderName) {
        this.riderName = riderName;
    }

    public List<OrderItemEmbeddable> getItems() {
        return items;
    }

    public void setItems(List<OrderItemEmbeddable> items) {
        this.items = items;
    }

    public BigDecimal getTotal() {
        return total;
    }

    public void setTotal(BigDecimal total) {
        this.total = total;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public void setStatus(OrderStatus status) {
        this.status = status;
    }

    public String getDeliveryAddress() {
        return deliveryAddress;
    }

    public void setDeliveryAddress(String deliveryAddress) {
        this.deliveryAddress = deliveryAddress;
    }

    public Double getDeliveryLat() {
        return deliveryLat;
    }

    public void setDeliveryLat(Double deliveryLat) {
        this.deliveryLat = deliveryLat;
    }

    public Double getDeliveryLng() {
        return deliveryLng;
    }

    public void setDeliveryLng(Double deliveryLng) {
        this.deliveryLng = deliveryLng;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public String getRejectReason() {
        return rejectReason;
    }

    public void setRejectReason(String rejectReason) {
        this.rejectReason = rejectReason;
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
        if (!(o instanceof OrderEntity other)) return false;
        return id != null && Objects.equals(id, other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
