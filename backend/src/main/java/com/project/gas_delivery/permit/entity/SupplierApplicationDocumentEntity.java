package com.project.gas_delivery.permit.entity;

import com.project.gas_delivery.permit.enums.SupplierApplicationDocumentType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Objects;

/**
 * Metadata for one PDF/image attached to a
 * {@link SupplierApplicationEntity}. Bytes live on disk under
 * {@code <app.uploads.dir>/supplier-applications/<supplierId>/...};
 * this row tracks where they are.
 *
 * <p>The V8 migration enforces a UNIQUE index on
 * {@code (supplier_application_id, document_type)} so a supplier cannot
 * accidentally upload two application forms — re-uploading a slot
 * replaces the prior row (and deletes the prior file on disk via
 * {@code SupplierApplicationDocumentStorageService#store}).</p>
 */
@Entity
@Table(name = "supplier_application_documents")
public class SupplierApplicationDocumentEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "supplier_application_id", nullable = false)
    private Long supplierApplicationId;

    @Enumerated(EnumType.STRING)
    @Column(name = "document_type", nullable = false, length = 40)
    private SupplierApplicationDocumentType documentType;

    @Column(name = "storage_key", nullable = false, length = 500)
    private String storageKey;

    @Column(name = "original_name", length = 255)
    private String originalName;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType = "application/pdf";

    @Column(name = "uploaded_at", nullable = false, updatable = false)
    private Instant uploadedAt;

    protected SupplierApplicationDocumentEntity() {
    }

    public SupplierApplicationDocumentEntity(Long supplierApplicationId,
                                             SupplierApplicationDocumentType documentType,
                                             String storageKey,
                                             String originalName,
                                             long sizeBytes,
                                             String contentType) {
        this.supplierApplicationId = supplierApplicationId;
        this.documentType = documentType;
        this.storageKey = storageKey;
        this.originalName = originalName;
        this.sizeBytes = sizeBytes;
        this.contentType = contentType == null ? "application/pdf" : contentType;
    }

    @PrePersist
    void onCreate() {
        if (this.uploadedAt == null) this.uploadedAt = Instant.now();
    }

    // ---- getters / setters ----

    public Long getId() { return id; }

    public Long getSupplierApplicationId() { return supplierApplicationId; }
    public void setSupplierApplicationId(Long supplierApplicationId) {
        this.supplierApplicationId = supplierApplicationId;
    }

    public SupplierApplicationDocumentType getDocumentType() { return documentType; }
    public void setDocumentType(SupplierApplicationDocumentType documentType) {
        this.documentType = documentType;
    }

    public String getStorageKey() { return storageKey; }
    public void setStorageKey(String storageKey) { this.storageKey = storageKey; }

    public String getOriginalName() { return originalName; }
    public void setOriginalName(String originalName) { this.originalName = originalName; }

    public long getSizeBytes() { return sizeBytes; }
    public void setSizeBytes(long sizeBytes) { this.sizeBytes = sizeBytes; }

    public String getContentType() { return contentType; }
    public void setContentType(String contentType) {
        this.contentType = contentType == null ? "application/pdf" : contentType;
    }

    public Instant getUploadedAt() { return uploadedAt; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SupplierApplicationDocumentEntity other)) return false;
        return id != null && Objects.equals(id, other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
