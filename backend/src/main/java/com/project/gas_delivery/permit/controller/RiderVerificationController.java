package com.project.gas_delivery.permit.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.permit.dto.RiderPermitDocumentDto;
import com.project.gas_delivery.permit.dto.RiderPermitDto;
import com.project.gas_delivery.permit.enums.RiderPermitDocumentType;
import com.project.gas_delivery.permit.service.RiderApplicationPdfService;
import com.project.gas_delivery.permit.service.RiderPermitService;
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
 * Rider-facing verification + certificate endpoints.
 *
 * <ul>
 *   <li>{@code GET  /api/rider-permits/me}                   – the
 *       rider's full verification application (lazy-creates a draft
 *       {@code PENDING} row on first call).</li>
 *   <li>{@code GET  /api/rider-permits/me/application-form}  – stream
 *       the blank Rider Application Form PDF (any role can fetch).</li>
 *   <li>{@code POST /api/rider-permits/me/documents?type=…}   – upload
 *       one document (multipart). Replaces any prior row for the slot.</li>
 *   <li>{@code DELETE /api/rider-permits/me/documents/{id}}   – remove
 *       one document the rider uploaded.</li>
 *   <li>{@code POST /api/rider-permits/me/submit}            – finalise
 *       the application (validates required slots, stamps
 *       {@code submittedAt}, notifies the rider).</li>
 *   <li>{@code GET  /api/rider-permits/me/certificate}       – stream
 *       the official Gas Delivery Rider Certificate PDF (404 when no
 *       application, 409 when not yet APPROVED).</li>
 * </ul>
 *
 * <p>The legacy {@code /api/riders/me/permit*} endpoints from part 1
 * are untouched and still served by {@link RiderPermitController} so
 * the Profile screen continues to read the certificate summary from
 * the {@code seller_permits}-backed projection.</p>
 */
@RestController
@RequestMapping("/api/rider-permits")
public class RiderVerificationController {

    private final RiderPermitService riderPermitService;
    private final RiderApplicationPdfService pdfService;

    public RiderVerificationController(RiderPermitService riderPermitService,
                                       RiderApplicationPdfService pdfService) {
        this.riderPermitService = riderPermitService;
        this.pdfService = pdfService;
    }

    @GetMapping("/me")
    public RiderPermitDto me(HttpServletRequest request) {
        Long riderId = requireRider(request);
        return riderPermitService.getOrCreateForRider(riderId);
    }

    @GetMapping("/me/application-form")
    public ResponseEntity<byte[]> applicationForm() {
        byte[] body = pdfService.renderBlankRiderApplicationForm();
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(body.length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"rider-application-form.pdf\"")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(body);
    }

    @PostMapping(value = "/me/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public RiderPermitDocumentDto uploadDocument(
            HttpServletRequest request,
            @RequestParam("type") String type,
            @RequestPart("file") MultipartFile file
    ) {
        Long riderId = requireRider(request);
        RiderPermitDocumentType documentType = parseType(type);
        return riderPermitService.uploadDocument(riderId, documentType, file);
    }

    @DeleteMapping("/me/documents/{id}")
    public ResponseEntity<Void> deleteDocument(
            HttpServletRequest request,
            @PathVariable("id") Long id
    ) {
        Long riderId = requireRider(request);
        riderPermitService.deleteDocument(riderId, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/me/submit")
    public RiderPermitDto submit(HttpServletRequest request) {
        Long riderId = requireRider(request);
        return riderPermitService.submit(riderId);
    }

    @GetMapping("/me/certificate")
    public ResponseEntity<byte[]> myCertificate(HttpServletRequest request) {
        Long riderId = requireRider(request);
        byte[] body = riderPermitService.renderCertificate(riderId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(body.length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"rider-permit-" + riderId + ".pdf\"")
                .body(body);
    }

    /**
     * Document streaming shared with the admin controller. Owner (rider)
     * or admin only.
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
        RiderPermitService.DocumentStream stream =
                riderPermitService.loadDocument(id, role, actorId);
        try {
            byte[] bytes = Files.readAllBytes(stream.path());
            MediaType mediaType = MediaType.APPLICATION_PDF;
            try {
                mediaType = MediaType.parseMediaType(stream.contentType());
            } catch (Exception ignored) {
                // Fall back to application/pdf.
            }
            String filename = stream.originalName() == null
                    ? "rider-document-" + id + fallbackExtension(stream.contentType())
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

    private static Long requireRider(HttpServletRequest request) {
        Long actorId = AuthFilter.currentActorId(request);
        Role role = AuthFilter.currentActorRole(request);
        if (actorId == null || role == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        if (role != Role.RIDER) {
            throw new NotAuthorizedException(
                    "Only riders can access the rider verification workflow.");
        }
        return actorId;
    }

    private static RiderPermitDocumentType parseType(String raw) {
        try {
            RiderPermitDocumentType type = RiderPermitDocumentType.fromJson(raw);
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