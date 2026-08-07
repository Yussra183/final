package com.project.gas_delivery.permit.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.permit.dto.SupplierApplicationDocumentDto;
import com.project.gas_delivery.permit.dto.SupplierApplicationDto;
import com.project.gas_delivery.permit.enums.SupplierApplicationDocumentType;
import com.project.gas_delivery.permit.service.SupplierApplicationPdfService;
import com.project.gas_delivery.permit.service.SupplierApplicationService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Files;

/**
 * Supplier-facing verification + certificate endpoints.
 *
 * <ul>
 *   <li>{@code GET    /api/supplier-applications/me}                  – the
 *       supplier's full verification application (lazy-creates a draft
 *       {@code PENDING} row on first call).</li>
 *   <li>{@code GET    /api/supplier-applications/me/application-form} – stream
 *       the blank Supplier Application Form PDF.</li>
 *   <li>{@code POST   /api/supplier-applications/me/documents?type=…}  – upload
 *       one document (multipart). Replaces any prior row for the slot.</li>
 *   <li>{@code DELETE /api/supplier-applications/me/documents/{id}}    – remove
 *       one document the supplier uploaded.</li>
 *   <li>{@code POST   /api/supplier-applications/me/submit}           – finalise
 *       the application (validates required slots, stamps
 *       {@code submittedAt}, notifies the supplier).</li>
 *   <li>{@code GET    /api/supplier-applications/me/certificate}      – stream
 *       the official Gas Supplier Certificate PDF (404 when no
 *       application, 409 when not yet APPROVED).</li>
 *   <li>{@code GET    /api/supplier-applications/documents/{id}}      – stream
 *       one document's bytes (admin or owning supplier).</li>
 * </ul>
 *
 * <p>The actor id is always resolved from the bearer-token-resolved
 * request attribute, never a path variable, so a supplier can never
 * request another supplier's application.</p>
 */
@RestController
@RequestMapping("/api/supplier-applications")
public class SupplierVerificationController {

    private final SupplierApplicationService supplierApplicationService;
    private final SupplierApplicationPdfService pdfService;

    public SupplierVerificationController(
            SupplierApplicationService supplierApplicationService,
            SupplierApplicationPdfService pdfService
    ) {
        this.supplierApplicationService = supplierApplicationService;
        this.pdfService = pdfService;
    }

    @GetMapping("/me")
    public SupplierApplicationDto me(HttpServletRequest request) {
        Long supplierId = requireSupplier(request);
        return supplierApplicationService.getOrCreateForSupplier(supplierId);
    }

    @GetMapping("/me/application-form")
    public ResponseEntity<byte[]> applicationForm(HttpServletRequest request) {
        requireSupplier(request);
        byte[] body = pdfService.renderBlankSupplierApplicationForm();
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(body.length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"supplier-application-form.pdf\"")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(body);
    }

    @PostMapping(value = "/me/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SupplierApplicationDocumentDto uploadDocument(
            HttpServletRequest request,
            @RequestParam("type") String type,
            @RequestPart("file") MultipartFile file
    ) {
        Long supplierId = requireSupplier(request);
        SupplierApplicationDocumentType documentType = parseType(type);
        return supplierApplicationService.uploadDocument(supplierId, documentType, file);
    }

    @DeleteMapping("/me/documents/{id}")
    public ResponseEntity<Void> deleteDocument(
            HttpServletRequest request,
            @PathVariable("id") Long id
    ) {
        Long supplierId = requireSupplier(request);
        supplierApplicationService.deleteDocument(supplierId, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/me/submit")
    public SupplierApplicationDto submit(HttpServletRequest request) {
        Long supplierId = requireSupplier(request);
        return supplierApplicationService.submit(supplierId);
    }

    @GetMapping("/me/certificate")
    public ResponseEntity<byte[]> myCertificate(HttpServletRequest request) {
        Long supplierId = requireSupplier(request);
        byte[] body = supplierApplicationService.renderCertificate(supplierId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(body.length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"supplier-certificate-" + supplierId + ".pdf\"")
                .body(body);
    }

    /**
     * Document streaming shared with the admin controller. Owner
     * (supplier) or admin only — the ownership check lives in the
     * service so both callers share one guard.
     */
    @GetMapping("/documents/{id}")
    public ResponseEntity<byte[]> downloadDocument(
            HttpServletRequest request,
            @PathVariable("id") Long id
    ) {
        Role role = AuthFilter.currentActorRole(request);
        Long actorId = AuthFilter.currentActorId(request);
        if (actorId == null || role == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        SupplierApplicationService.DocumentStream stream =
                supplierApplicationService.loadDocument(id, role, actorId);
        try {
            byte[] bytes = Files.readAllBytes(stream.path());
            MediaType mediaType = MediaType.APPLICATION_PDF;
            try {
                mediaType = MediaType.parseMediaType(stream.contentType());
            } catch (Exception ignored) {
                // Fall back to application/pdf.
            }
            String filename = stream.originalName() == null
                    ? "supplier-document-" + id + fallbackExtension(stream.contentType())
                    : stream.originalName();
            return ResponseEntity.ok()
                    .contentType(mediaType)
                    .contentLength(stream.sizeBytes())
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "inline; filename=\"" + filename + "\"")
                    .body(bytes);
        } catch (java.io.IOException e) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    "Could not stream document: " + e.getMessage());
        }
    }

    private static Long requireSupplier(HttpServletRequest request) {
        Long actorId = AuthFilter.currentActorId(request);
        Role role = AuthFilter.currentActorRole(request);
        if (actorId == null || role == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        if (role != Role.SUPPLIER) {
            throw new NotAuthorizedException(
                    "Only suppliers can access the supplier verification workflow.");
        }
        return actorId;
    }

    private static SupplierApplicationDocumentType parseType(String raw) {
        try {
            SupplierApplicationDocumentType type =
                    SupplierApplicationDocumentType.fromJson(raw);
            if (type == null) {
                throw new com.project.gas_delivery.auth.exception.BadRequestException(
                        "Unknown document type: " + raw);
            }
            return type;
        } catch (IllegalArgumentException e) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    "Unknown document type: " + raw);
        }
    }

    private static String fallbackExtension(String contentType) {
        if (contentType == null) return ".pdf";
        return switch (contentType.toLowerCase()) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "application/pdf" -> ".pdf";
            default -> ".pdf";
        };
    }
}
