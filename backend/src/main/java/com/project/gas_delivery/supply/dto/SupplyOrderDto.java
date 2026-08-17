package com.project.gas_delivery.supply.dto;

import com.project.gas_delivery.supply.entity.SupplyOrderEntity;

import java.time.Instant;

/**
 * Wire shape for a {@code supply_orders} row (FR-06).
 *
 * <p>Field names mirror the frontend {@code RestockRequest} interface so
 * the existing {@code StoreContext.requestRestock / updateRestockStatus}
 * callbacks need no further translation. {@code status} is lowercase to
 * match the rest of the API's {@code order} endpoints.</p>
 */
public class SupplyOrderDto {

    private Long id;
    private Long sellerId;
    private String sellerName;
    private Long supplierId;
    private String supplierName;
    private String productName;
    private String size;
    private int quantity;
    private Long productId;
    private String notes;
    private String status;
    private String rejectReason;
    private Instant dispatchedAt;
    private Instant deliveredAt;
    private Instant receivedAt;
    private Instant cancelledAt;
    private String cancelledByRole;
    private Instant createdAt;
    private Instant updatedAt;

    public static SupplyOrderDto from(SupplyOrderEntity e) {
        SupplyOrderDto d = new SupplyOrderDto();
        d.id = e.getId();
        d.sellerId = e.getSellerId();
        d.sellerName = e.getSellerName();
        d.supplierId = e.getSupplierId();
        d.supplierName = e.getSupplierName();
        d.productName = e.getProductName();
        d.size = e.getSize();
        d.quantity = e.getQuantity();
        d.productId = e.getProductId();
        d.notes = e.getNotes();
        d.status = e.getStatus() == null ? null : e.getStatus().toJson();
        d.rejectReason = e.getRejectReason();
        d.dispatchedAt = e.getDispatchedAt();
        d.deliveredAt = e.getDeliveredAt();
        d.receivedAt = e.getReceivedAt();
        d.cancelledAt = e.getCancelledAt();
        d.cancelledByRole = e.getCancelledByRole();
        d.createdAt = e.getCreatedAt();
        d.updatedAt = e.getUpdatedAt();
        return d;
    }

    public Long getId() { return id; }
    public Long getSellerId() { return sellerId; }
    public String getSellerName() { return sellerName; }
    public Long getSupplierId() { return supplierId; }
    public String getSupplierName() { return supplierName; }
    public String getProductName() { return productName; }
    public String getSize() { return size; }
    public int getQuantity() { return quantity; }
    public Long getProductId() { return productId; }
    public String getNotes() { return notes; }
    public String getStatus() { return status; }
    public String getRejectReason() { return rejectReason; }
    public Instant getDispatchedAt() { return dispatchedAt; }
    public Instant getDeliveredAt() { return deliveredAt; }
    public Instant getReceivedAt() { return receivedAt; }
    public Instant getCancelledAt() { return cancelledAt; }
    public String getCancelledByRole() { return cancelledByRole; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
