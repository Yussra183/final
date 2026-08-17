package com.project.gas_delivery.supply.dto;

import com.project.gas_delivery.supply.enums.SupplyOrderStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code PATCH /api/restock/{id}/status} — FR-06 status
 * transition request from either the supplier or the seller.
 *
 * <p>{@code reason} is required for transitions into {@code REJECTED} or
 * {@code CANCELLED}; otherwise it is ignored.</p>
 */
public class UpdateSupplyOrderStatusRequest {

    @NotNull
    private SupplyOrderStatus status;

    @Size(max = 500)
    private String reason;

    public UpdateSupplyOrderStatusRequest() {}

    public SupplyOrderStatus getStatus() { return status; }
    public void setStatus(SupplyOrderStatus status) { this.status = status; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}
