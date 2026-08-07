package com.project.gas_delivery.permit.dto;

import com.project.gas_delivery.permit.entity.SellerPermitEntity;
import com.project.gas_delivery.permit.enums.PermitStatus;

import java.time.Instant;
import java.util.List;

/**
 * Wire form of a seller's permit application. Mirrors the frontend's
 * {@code PermitApplication} interface ({@code constants/types.ts}).
 *
 * <p>Note the field names map onto the React Native camelCase shape — the
 * JSON property names are deliberately distinct from the entity so the
 * frontend can consume the payload without renaming. Jackson's default
 * naming strategy maps the record components verbatim, so component names
 * already match.</p>
 */
public record SellerPermitDto(
        String id,
        String sellerId,
        String sellerName,
        String businessName,
        String status,
        List<PermitDocumentDto> documents,
        String rejectionReason,
        Instant submittedAt,
        Instant reviewedAt,
        String reviewedByName
) {

    public static SellerPermitDto from(SellerPermitEntity entity,
                                       String sellerName,
                                       List<PermitDocumentDto> documents,
                                       String reviewedByName) {
        return new SellerPermitDto(
                String.valueOf(entity.getId()),
                String.valueOf(entity.getSellerId()),
                sellerName,
                entity.getBusinessName(),
                entity.getStatus() == null ? null : entity.getStatus().toJson(),
                documents,
                entity.getRejectionReason(),
                entity.getSubmittedAt(),
                entity.getReviewedAt(),
                reviewedByName
        );
    }

    /** Convenience overload used when callers don't need document metadata. */
    public SellerPermitDto withDocuments(List<PermitDocumentDto> docs) {
        return new SellerPermitDto(
                id, sellerId, sellerName, businessName, status, docs,
                rejectionReason, submittedAt, reviewedAt, reviewedByName
        );
    }

    /** Convenience overload for status-only refreshes. */
    public SellerPermitDto withStatus(PermitStatus newStatus) {
        return new SellerPermitDto(
                id, sellerId, sellerName, businessName,
                newStatus == null ? null : newStatus.toJson(),
                documents, rejectionReason, submittedAt, reviewedAt, reviewedByName
        );
    }
}
