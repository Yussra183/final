package com.project.gas_delivery.permit.dto;

import com.project.gas_delivery.permit.entity.RiderPermitDocumentEntity;

import java.time.Instant;

/**
 * Wire form of a {@code rider_permit_documents} row. The
 * {@code downloadUrl} is constructed by the controller layer — the entity
 * itself only knows the storage key.
 */
public record RiderPermitDocumentDto(
        String id,
        String documentType,
        String originalName,
        long sizeBytes,
        String contentType,
        Instant uploadedAt,
        String downloadUrl
) {

    public static RiderPermitDocumentDto from(RiderPermitDocumentEntity entity, String downloadUrl) {
        return new RiderPermitDocumentDto(
                String.valueOf(entity.getId()),
                entity.getDocumentType().toJson(),
                entity.getOriginalName(),
                entity.getSizeBytes(),
                entity.getContentType(),
                entity.getUploadedAt(),
                downloadUrl
        );
    }
}