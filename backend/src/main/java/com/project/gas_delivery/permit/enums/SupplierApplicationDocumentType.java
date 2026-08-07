package com.project.gas_delivery.permit.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Lifecycle document slot for the supplier verification workflow.
 *
 * <p>Mirrors the wire shape the supplier-facing
 * {@code POST /api/supplier-applications/me/documents?type=…} endpoint
 * accepts and the {@code supplier_application_documents.document_type}
 * column stores. The values are intentionally distinct from the seller
 * {@link PermitDocumentType} and the rider
 * {@link RiderPermitDocumentType} so the three workflows can coexist on
 * the same backend without sharing a CHECK constraint.</p>
 *
 * <p>Slot semantics:</p>
 * <ul>
 *   <li>{@link #SUPPLIER_APPLICATION_FORM} — supplier fills the blank
 *       form, signs, scans, uploads as PDF.</li>
 *   <li>{@link #SUPPLIER_NATIONAL_ID} — government-issued national ID;
 *       PDF or image.</li>
 *   <li>{@link #SUPPLIER_BUSINESS_REGISTRATION} — business registration
 *       certificate (PDF only).</li>
 *   <li>{@link #SUPPLIER_TIN_CERTIFICATE} — Tax Identification Number
 *       certificate (PDF only).</li>
 *   <li>{@link #SUPPLIER_BUSINESS_LICENCE} — business licence
 *       (PDF only).</li>
 *   <li>{@link #SUPPLIER_PASSPORT_PHOTO} — passport-size photograph
 *       (image or PDF).</li>
 *   <li>{@link #SUPPLIER_CERTIFICATE} — the official Gas Delivery
 *       Supplier Certificate issued on admin approval. Never uploaded by
 *       the supplier; the renderer generates it on demand.</li>
 * </ul>
 */
public enum SupplierApplicationDocumentType {
    SUPPLIER_APPLICATION_FORM,
    SUPPLIER_NATIONAL_ID,
    SUPPLIER_BUSINESS_REGISTRATION,
    SUPPLIER_TIN_CERTIFICATE,
    SUPPLIER_BUSINESS_LICENCE,
    SUPPLIER_PASSPORT_PHOTO,
    SUPPLIER_CERTIFICATE;

    /** True when the supplier is allowed to upload this slot. */
    public boolean isSupplierProvided() {
        return this != SUPPLIER_CERTIFICATE;
    }

    /** Lowercase wire form consumed by the React Native frontend. */
    @JsonValue
    public String toJson() {
        return switch (this) {
            case SUPPLIER_APPLICATION_FORM -> "supplier_application_form";
            case SUPPLIER_NATIONAL_ID -> "supplier_national_id";
            case SUPPLIER_BUSINESS_REGISTRATION -> "supplier_business_registration";
            case SUPPLIER_TIN_CERTIFICATE -> "supplier_tin_certificate";
            case SUPPLIER_BUSINESS_LICENCE -> "supplier_business_licence";
            case SUPPLIER_PASSPORT_PHOTO -> "supplier_passport_photo";
            case SUPPLIER_CERTIFICATE -> "supplier_certificate";
        };
    }

    @JsonCreator
    public static SupplierApplicationDocumentType fromJson(String value) {
        if (value == null) return null;
        String normalised = value.trim().toLowerCase();
        for (SupplierApplicationDocumentType t : values()) {
            if (t.toJson().equals(normalised)) return t;
        }
        // Tolerate the SCREAMING_SNAKE form too — handy for tests that
        // work directly off the enum name rather than the JSON form.
        String upper = value.trim().toUpperCase();
        for (SupplierApplicationDocumentType t : values()) {
            if (t.name().equals(upper)) return t;
        }
        throw new IllegalArgumentException("Unknown supplier document type: " + value);
    }
}
