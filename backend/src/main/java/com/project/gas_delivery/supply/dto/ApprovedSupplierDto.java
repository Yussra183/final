package com.project.gas_delivery.supply.dto;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.permit.entity.SupplierApplicationEntity;

/**
 * Wire shape for {@code GET /api/suppliers/approved} — the supplier
 * picker shown in the seller's restock form (FR-06).
 *
 * <p>The shape mirrors the frontend's expectation: a stable supplier id,
 * the supplier's display name + email/phone for context, and the admin
 * approval stamp so the seller sees when the supplier was vetted.</p>
 */
public class ApprovedSupplierDto {

    private Long id;
    private String fullName;
    private String email;
    private String phone;
    private String certificateNumber;
    private String approvedAt;

    public static ApprovedSupplierDto from(User supplier, SupplierApplicationEntity application) {
        ApprovedSupplierDto d = new ApprovedSupplierDto();
        d.id = supplier.getId();
        d.fullName = supplier.getFullName();
        d.email = supplier.getEmail();
        d.phone = supplier.getPhone();
        d.certificateNumber = "SUP-" + String.format("%06d", application.getId());
        d.approvedAt = application.getReviewedAt() == null
                ? null
                : application.getReviewedAt().toString();
        return d;
    }

    public Long getId() { return id; }
    public String getFullName() { return fullName; }
    public String getEmail() { return email; }
    public String getPhone() { return phone; }
    public String getCertificateNumber() { return certificateNumber; }
    public String getApprovedAt() { return approvedAt; }
}
