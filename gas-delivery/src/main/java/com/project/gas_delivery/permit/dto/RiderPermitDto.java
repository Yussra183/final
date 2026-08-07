package com.project.gas_delivery.permit.dto;

import com.project.gas_delivery.permit.entity.RiderApplicationEntity;
import com.project.gas_delivery.permit.entity.SellerPermitEntity;
import com.project.gas_delivery.permit.enums.PermitStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

/**
 * Wire form of a rider's permit certificate + verification application.
 *
 * <p>The status / certificate number / issued-at / valid-until fields
 * were added in part 1 (the Rider Profile module) so the self-service
 * Profile screen could surface the certificate summary. The
 * {@code documents} list and the status-machine helpers were added with
 * the Rider Verification workflow so the admin and the rider can both
 * see every uploaded PDF in a single round-trip.</p>
 *
 * <p>{@code certificateUrl} is a server-relative path the React Native
 * client appends to {@code API_CONFIG.BASE_URL} when streaming the PDF.</p>
 */
public record RiderPermitDto(
        String id,
        String riderId,
        String status,
        String certificateNumber,
        String certificateUrl,
        Instant issuedAt,
        LocalDate validFrom,
        LocalDate validUntil,
        Instant submittedAt,
        Instant reviewedAt,
        String reviewedByName,
        /**
         * Applicant's full name resolved from the {@code users} table at
         * the moment the DTO is projected. Surfaced on the rider Profile
         * screen so the rider sees their application summary card with
         * their own name (instead of just a National ID Number).
         */
        String applicantName,
        String rejectionReason,
        List<RiderPermitDocumentDto> documents
) {

    /** Backwards-compatible factory used by the Profile-only endpoints. */
    public static RiderPermitDto summary(
            RiderApplicationEntity entity, String certificateNumber
    ) {
        return from(entity, certificateNumber, null, null, List.of());
    }

    /**
     * Legacy factory — projects the seller_permits row that part 1 of
     * the Rider Profile module used to read the certificate summary. The
     * {@code seller_id} column stores the rider id, so the projection
     * is identical to the rider_application one minus the documents list.
     */
    public static RiderPermitDto summary(
            SellerPermitEntity entity, String certificateNumber
    ) {
        PermitStatus status = entity.getStatus();
        Instant reviewedAt = entity.getReviewedAt();
        LocalDate validFrom = (reviewedAt == null)
                ? null
                : reviewedAt.atZone(ZoneOffset.UTC).toLocalDate();
        LocalDate validUntil = (validFrom == null) ? null : validFrom.plusYears(1);
        return new RiderPermitDto(
                String.valueOf(entity.getId()),
                String.valueOf(entity.getSellerId()),
                status == null ? null : status.toJson(),
                certificateNumber,
                "/api/rider-permits/me/certificate",
                reviewedAt,
                validFrom,
                validUntil,
                entity.getSubmittedAt(),
                reviewedAt,
                null,
                null,
                entity.getRejectionReason(),
                List.of()
        );
    }

    public static RiderPermitDto from(
            RiderApplicationEntity entity,
            String certificateNumber,
            String reviewedByName,
            String applicantName,
            List<RiderPermitDocumentDto> documents
    ) {
        PermitStatus status = entity.getStatus();
        Instant reviewedAt = entity.getReviewedAt();
        LocalDate validFrom = (reviewedAt == null)
                ? null
                : reviewedAt.atZone(ZoneOffset.UTC).toLocalDate();
        LocalDate validUntil = (validFrom == null) ? null : validFrom.plusYears(1);
        return new RiderPermitDto(
                String.valueOf(entity.getId()),
                String.valueOf(entity.getRiderId()),
                status == null ? null : status.toJson(),
                certificateNumber,
                "/api/rider-permits/me/certificate",
                reviewedAt,
                validFrom,
                validUntil,
                entity.getSubmittedAt(),
                reviewedAt,
                reviewedByName,
                applicantName,
                entity.getRejectionReason(),
                documents
        );
    }
}