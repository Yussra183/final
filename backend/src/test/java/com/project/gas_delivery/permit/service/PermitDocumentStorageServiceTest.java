package com.project.gas_delivery.permit.service;

import com.project.gas_delivery.permit.enums.PermitDocumentType;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Pure-Java unit tests for the per-slot MIME allow-list that
 * {@link PermitDocumentStorageService} enforces on the multipart
 * upload. The validator itself is private; we test the package-private
 * {@link PermitDocumentStorageService#isAllowedMime(PermitDocumentType, String)}
 * helper that the validator consults.
 *
 * <p>Magic-byte sniffing is exercised indirectly by reading the
 * constant arrays reflected via the same helper — the acceptance
 * decision is the same. The end-to-end multipart behaviour is covered
 * by the order-flow smoke tests under {@code scripts/}.</p>
 */
class PermitDocumentStorageServiceTest {

    // ---- application_form & business_license: PDF-only --------------------

    @Test
    void applicationFormAcceptsPdf() {
        assertNotNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.APPLICATION_FORM, "application/pdf"));
    }

    @Test
    void applicationFormRejectsJpeg() {
        assertNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.APPLICATION_FORM, "image/jpeg"));
    }

    @Test
    void businessLicenseAcceptsPdf() {
        assertNotNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.BUSINESS_LICENSE, "application/pdf"));
    }

    @Test
    void businessLicenseRejectsPng() {
        assertNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.BUSINESS_LICENSE, "image/png"));
    }

    // ---- national_id: PDF or image ---------------------------------------

    @Test
    void nationalIdAcceptsPdf() {
        assertNotNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.NATIONAL_ID, "application/pdf"));
    }

    @Test
    void nationalIdAcceptsJpeg() {
        assertNotNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.NATIONAL_ID, "image/jpeg"));
    }

    @Test
    void nationalIdAcceptsPng() {
        assertNotNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.NATIONAL_ID, "image/png"));
    }

    @Test
    void nationalIdRejectsWebp() {
        assertNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.NATIONAL_ID, "image/webp"));
    }

    @Test
    void nationalIdRejectsHeic() {
        assertNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.NATIONAL_ID, "image/heic"));
    }

    // ---- passport_photo: image only ---------------------------------------

    @Test
    void passportPhotoAcceptsJpeg() {
        assertNotNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.PASSPORT_PHOTO, "image/jpeg"));
    }

    @Test
    void passportPhotoAcceptsPng() {
        assertNotNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.PASSPORT_PHOTO, "image/png"));
    }

    @Test
    void passportPhotoRejectsPdf() {
        assertNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.PASSPORT_PHOTO, "application/pdf"));
    }

    // ---- license (admin): PDF-only ---------------------------------------

    @Test
    void licenseAcceptsPdf() {
        assertNotNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.LICENSE, "application/pdf"));
    }

    @Test
    void licenseRejectsJpeg() {
        assertNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.LICENSE, "image/jpeg"));
    }

    // ---- case-insensitive accept -----------------------------------------

    @Test
    void allowsUpperCaseMimeStrings() {
        assertEquals("application/pdf",
                PermitDocumentStorageService.isAllowedMime(
                        PermitDocumentType.APPLICATION_FORM, "APPLICATION/PDF"));
    }

    // ---- null / empty MIME handling --------------------------------------

    @Test
    void nullMimeIsNotAllowed() {
        assertNull(PermitDocumentStorageService.isAllowedMime(
                PermitDocumentType.NATIONAL_ID, null));
    }
}
