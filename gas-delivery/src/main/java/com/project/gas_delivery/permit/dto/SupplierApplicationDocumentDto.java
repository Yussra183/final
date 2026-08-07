package com.project.gas_delivery.permit.dto;

import com.project.gas_delivery.permit.entity.SupplierApplicationDocumentEntity;

import java.time.Instant;

/**
 * Wire form of a {@code supplier_application_documents} row. The
 * {@code downloadUrl} is constructed by the controller layer — the entity
 * itself only knows the storage key.
 */
public record SupplierApplicationDocumentDto(
        String id,
        String documentType,
        String originalName,
        long sizeBytes,
        String contentType,
        Instant uploadedAt,
        String downloadUrl
) {

    public static SupplierApplicationDocumentDto from(
            SupplierApplicationDocumentEntity entity, String downloadUrl
    ) {
        return new SupplierApplicationDocumentDto(
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
