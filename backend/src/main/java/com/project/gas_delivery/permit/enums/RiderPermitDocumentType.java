package com.project.gas_delivery.permit.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Lifecycle document slot for the rider verification workflow.
 *
 * <p>Mirrors the wire shape the rider-facing
 * {@code POST /api/rider-permits/me/documents?type=…} endpoint accepts
 * and the {@code rider_permit_documents.document_type} column stores.
 * The values are intentionally distinct from the seller
 * {@link PermitDocumentType} so the two workflows can coexist on the
 * same backend without sharing a CHECK constraint.</p>
 *
 * <p>Slot semantics:</p>
 * <ul>
 *   <li>{@link #RIDER_APPLICATION_FORM} — rider fills the blank form,
 *       signs, scans, uploads as PDF.</li>
 *   <li>{@link #RIDER_NATIONAL_ID} — government-issued national ID;
 *       PDF or image.</li>
 *   <li>{@link #RIDER_DRIVING_LICENCE} — driving licence (PDF only).</li>
 *   <li>{@link #RIDER_PASSPORT_PHOTO} — passport-size photograph
 *       (image or PDF).</li>
 *   <li>{@link #RIDER_VEHICLE_REGISTRATION} — vehicle registration
 *       card (PDF only).</li>
 *   <li>{@link #RIDER_PERMIT} — the official Gas Delivery Rider
 *       Certificate issued on admin approval. Never uploaded by the
 *       rider; the renderer generates it on demand.</li>
 * </ul>
 */
public enum RiderPermitDocumentType {
    RIDER_APPLICATION_FORM,
    RIDER_NATIONAL_ID,
    RIDER_DRIVING_LICENCE,
    RIDER_PASSPORT_PHOTO,
    RIDER_VEHICLE_REGISTRATION,
    RIDER_PERMIT;

    /** True when the rider is allowed to upload this slot. */
    public boolean isRiderProvided() {
        return this != RIDER_PERMIT;
    }

    /** Lowercase wire form consumed by the React Native frontend. */
    @JsonValue
    public String toJson() {
        return switch (this) {
            case RIDER_APPLICATION_FORM -> "rider_application_form";
            case RIDER_NATIONAL_ID -> "rider_national_id";
            case RIDER_DRIVING_LICENCE -> "rider_driving_licence";
            case RIDER_PASSPORT_PHOTO -> "rider_passport_photo";
            case RIDER_VEHICLE_REGISTRATION -> "rider_vehicle_registration";
            case RIDER_PERMIT -> "rider_permit";
        };
    }

    @JsonCreator
    public static RiderPermitDocumentType fromJson(String value) {
        if (value == null) return null;
        String normalised = value.trim().toLowerCase();
        for (RiderPermitDocumentType t : values()) {
            if (t.toJson().equals(normalised)) return t;
        }
        // Tolerate the SCREAMING_SNAKE form too — handy for tests that
        // work directly off the enum name rather than the JSON form.
        String upper = value.trim().toUpperCase();
        for (RiderPermitDocumentType t : values()) {
            if (t.name().equals(upper)) return t;
        }
        throw new IllegalArgumentException("Unknown rider document type: " + value);
    }
}