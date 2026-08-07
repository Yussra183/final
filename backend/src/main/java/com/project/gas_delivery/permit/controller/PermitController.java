package com.project.gas_delivery.permit.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.permit.dto.PermitDocumentDto;
import com.project.gas_delivery.permit.dto.SellerPermitDto;
import com.project.gas_delivery.permit.dto.SubmitPermitRequest;
import com.project.gas_delivery.permit.enums.PermitDocumentType;
import com.project.gas_delivery.permit.service.PermitService;
import com.project.gas_delivery.permit.service.PermitService.DocumentStream;
import com.project.gas_delivery.permit.service.SellerApplicationPdfService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.core.io.PathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Seller-facing permit endpoints.
 *
 * <ul>
 *   <li>{@code GET    /api/permits/me}                – return the seller's
 *                                                        current permit,
 *                                                        creating a draft
 *                                                        row on first
 *                                                        call.</li>
 *   <li>{@code POST   /api/permits/me/documents}      – upload a single
 *                                                        PDF for one slot
 *                                                        (multipart).</li>
 *   <li>{@code DELETE /api/permits/me/documents/{id}} – remove a doc
 *                                                        before submission.</li>
 *   <li>{@code POST   /api/permits/me/submit}         – finalise the
 *                                                        application.</li>
 *   <li>{@code GET    /api/permits/me/license}        – download the
 *                                                        approved licence.</li>
 *   <li>{@code GET    /api/permits/application-form}  – download the
 *                                                        blank application
 *                                                        PDF (any authed
 *                                                        role).</li>
 *   <li>{@code GET    /api/permits/documents/{id}}    – admin / owning
 *                                                        seller streams a
 *                                                        PDF.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/permits")
public class PermitController {

    private final PermitService permitService;
    private final SellerApplicationPdfService pdfService;

    public PermitController(PermitService permitService,
                            SellerApplicationPdfService pdfService) {
        this.permitService = permitService;
        this.pdfService = pdfService;
    }

    // ---- seller-side -----------------------------------------------------

    @GetMapping("/me")
    public SellerPermitDto myPermit(HttpServletRequest request) {
        Long sellerId = requireSeller(request);
        return permitService.getOrCreateForSeller(sellerId);
    }

    @PostMapping(value = "/me/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public PermitDocumentDto uploadDocument(
            HttpServletRequest request,
            @RequestParam("type") String type,
            @RequestParam("file") MultipartFile file
    ) {
        Long sellerId = requireSeller(request);
        PermitDocumentType documentType;
        try {
            documentType = PermitDocumentType.fromJson(type);
        } catch (IllegalArgumentException e) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    "Unknown document type: " + type);
        }
        return permitService.uploadDocument(sellerId, documentType, file);
    }

    @DeleteMapping("/me/documents/{id}")
    public ResponseEntity<Void> deleteDocument(HttpServletRequest request, @PathVariable("id") Long id) {
        Long sellerId = requireSeller(request);
        permitService.deleteDocument(sellerId, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/me/submit")
    public SellerPermitDto submit(
            HttpServletRequest request,
            @Valid @RequestBody SubmitPermitRequest body
    ) {
        Long sellerId = requireSeller(request);
        return permitService.submit(sellerId, body);
    }

    // ---- document streaming ---------------------------------------------

    @GetMapping("/documents/{id}")
    public ResponseEntity<Resource> downloadDocument(
            HttpServletRequest request,
            @PathVariable("id") Long id
    ) {
        Long actorId = AuthFilter.currentActorId(request);
        Role actorRole = AuthFilter.currentActorRole(request);
        if (actorId == null || actorRole == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        DocumentStream stream = permitService.loadDocument(id, actorRole, actorId);
        MediaType mediaType = MediaType.APPLICATION_PDF;
        try {
            mediaType = MediaType.parseMediaType(stream.contentType());
        } catch (Exception ignored) {
            // Fall back to application/pdf.
        }
        String filename = stream.originalName() == null
                ? "permit-document-" + id + fallbackExtension(stream.contentType())
                : stream.originalName();
        return ResponseEntity.ok()
                .contentType(mediaType)
                .contentLength(stream.sizeBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"" + filename + "\"")
                .body(new PathResource(stream.path()));
    }

    @GetMapping("/me/license")
    public ResponseEntity<byte[]> myLicense(HttpServletRequest request) {
        Long sellerId = requireSeller(request);
        SellerPermitDto permit = permitService.getForSeller(sellerId);
        if (!"approved".equalsIgnoreCase(permit.status())) {
            throw new com.project.gas_delivery.permit.exception.PermitStateException(
                    "Licence is only available for approved sellers.");
        }
        // The approved licence is regenerated on demand by
        // {@link SellerApplicationPdfService} so the rendered PDF always
        // reflects the latest application and review data. The
        // admin-uploaded licence document (if any) is exposed via
        // {@code GET /api/permits/documents/{id}} for audit purposes.
        byte[] body = pdfService.renderIssuedLicense(
                permitService.buildIssuedLicenseData(sellerId));
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(body.length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"seller-licence-" + sellerId + ".pdf\"")
                .body(body);
    }

    @GetMapping("/application-form")
    public ResponseEntity<byte[]> applicationForm() {
        // The blank application form is rendered on demand by
        // {@link SellerApplicationPdfService} so the layout and content
        // stay in lockstep with the seller licence that is issued on
        // approval. Any authenticated role can download it.
        byte[] body = pdfService.renderBlankApplicationForm();
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(body.length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"seller-application-form.pdf\"")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(body);
    }

    private static Long requireSeller(HttpServletRequest request) {
        Long actorId = AuthFilter.currentActorId(request);
        Role role = AuthFilter.currentActorRole(request);
        if (actorId == null || role == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        if (role != Role.SELLER) {
            throw new NotAuthorizedException("Only sellers can manage permit applications.");
        }
        return actorId;
    }

    /**
     * Map a stored MIME type to a file extension used in the
     * {@code Content-Disposition} fallback filename. Defaults to
     * {@code .pdf} so legacy rows that pre-date the image policy still
     * download as something sensible.
     */
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
