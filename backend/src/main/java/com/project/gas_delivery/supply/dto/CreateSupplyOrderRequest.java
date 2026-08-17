package com.project.gas_delivery.supply.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code POST /api/restock} — FR-06 seller raises a supply
 * request to a supplier (or to the open pool when {@code supplierId} is
 * omitted).
 */
public class CreateSupplyOrderRequest {

    private Long supplierId;

    @Size(max = 120)
    private String supplierName;

    @NotBlank
    @Size(max = 160)
    private String productName;

    @NotBlank
    @Size(max = 40)
    private String size;

    @Min(1)
    private int quantity;

    private Long productId;

    @Size(max = 1000)
    private String notes;

    public CreateSupplyOrderRequest() {}

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
}
