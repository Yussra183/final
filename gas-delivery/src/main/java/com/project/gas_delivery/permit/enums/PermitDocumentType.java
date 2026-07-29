package com.project.gas_delivery.permit.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * The four PDF slots persisted under {@code permit_documents.document_type}.
 *
 * <ul>
 *   <li>{@link #APPLICATION_FORM}   – seller-completed application form
 *                                     downloaded from the system template.</li>
 *   <li>{@link #BIRTH_CERTIFICATE}  – government-issued birth certificate.</li>
 *   <li>{@link #NATIONAL_ID}        – national ID card, front + back.</li>
 *   <li>{@link #LICENSE}            – admin-uploaded approved licence,
 *                                     available to the seller once the
 *                                     permit reaches {@code APPROVED}.</li>
 * </ul>
 *
 * The first three are required for submission; {@link #LICENSE} is
 * optional until admin approval and is written exactly once per permit.
 */
public enum PermitDocumentType {
    APPLICATION_FORM,
    BIRTH_CERTIFICATE,
    NATIONAL_ID,
    LICENSE;

    @JsonValue
    public String toJson() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static PermitDocumentType fromJson(String value) {
        if (value == null) return null;
        String normalised = value.trim().toUpperCase();
        for (PermitDocumentType t : values()) {
            if (t.name().equals(normalised)) return t;
        }
        throw new IllegalArgumentException("Unknown permit document type: " + value);
    }

    /** True for the three slots a seller must upload before submission. */
    public boolean isSellerProvided() {
        return this != LICENSE;
    }
}
