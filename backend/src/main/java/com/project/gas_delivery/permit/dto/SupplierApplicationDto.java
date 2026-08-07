package com.project.gas_delivery.permit.dto;

import com.project.gas_delivery.permit.entity.SupplierApplicationEntity;
import com.project.gas_delivery.permit.enums.PermitStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

/**
 * Wire form of a supplier's verification application + issued
 * certificate summary.
 *
 * <p>Mirrors {@link RiderPermitDto} so the React Native client can reuse
 * the same rendering logic for both roles. The {@code documents} list
 * lets the admin and the supplier see every uploaded document in a
 * single round-trip.</p>
 *
 * <p>{@code certificateUrl} is a server-relative path the React Native
 * client appends to {@code API_CONFIG.BASE_URL} when streaming the PDF.
 * It is only usable once {@code status == "approved"} — the endpoint
 * returns HTTP 409 otherwise.</p>
 *
 * <p>{@code supplierName} / {@code supplierUsername} / {@code supplierEmail}
 * / {@code supplierPhone} are denormalised so the admin review queue can
 * render the applicant without a second lookup.</p>
 */
public record SupplierApplicationDto(
        String id,
        String supplierId,
        String supplierName,
        String supplierUsername,
        String supplierEmail,
        String supplierPhone,
        String status,
        String certificateNumber,
        String certificateUrl,
        Instant issuedAt,
        LocalDate validFrom,
        LocalDate validUntil,
        Instant submittedAt,
        Instant reviewedAt,
        String reviewedByName,
        String rejectionReason,
        List<SupplierApplicationDocumentDto> documents
) {

    public static SupplierApplicationDto from(
            SupplierApplicationEntity entity,
            String certificateNumber,
            String supplierName,
            String supplierUsername,
            String supplierEmail,
            String supplierPhone,
            String reviewedByName,
            List<SupplierApplicationDocumentDto> documents
    ) {
        PermitStatus status = entity.getStatus();
        Instant reviewedAt = entity.getReviewedAt();
        // The validity window is only meaningful once an admin has
        // reviewed the application; before that both ends stay null so
        // the client renders nothing rather than a bogus date range.
        LocalDate validFrom = (reviewedAt == null)
                ? null
                : reviewedAt.atZone(ZoneOffset.UTC).toLocalDate();
        LocalDate validUntil = (validFrom == null) ? null : validFrom.plusYears(1);
        return new SupplierApplicationDto(
                String.valueOf(entity.getId()),
                String.valueOf(entity.getSupplierId()),
                supplierName,
                supplierUsername,
                supplierEmail,
                supplierPhone,
                status == null ? null : status.toJson(),
                certificateNumber,
                "/api/supplier-applications/me/certificate",
                reviewedAt,
                validFrom,
                validUntil,
                entity.getSubmittedAt(),
                reviewedAt,
                reviewedByName,
                entity.getRejectionReason(),
                documents
        );
    }
}
