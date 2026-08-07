package com.project.gas_delivery.admin.controller;

import com.project.gas_delivery.admin.AdminGuard;
import com.project.gas_delivery.permit.dto.PermitDocumentDto;
import com.project.gas_delivery.permit.dto.RejectPermitRequest;
import com.project.gas_delivery.permit.dto.SellerPermitDto;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.service.PermitService;
import com.project.gas_delivery.permit.service.SellerApplicationPdfService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * Admin endpoints for the permit verification workflow.
 *
 * <ul>
 *   <li>{@code GET  /api/admin/permits?status=}            – review queue.</li>
 *   <li>{@code GET  /api/admin/permits/{id}}               – single permit.</li>
 *   <li>{@code GET  /api/admin/permits/{id}/documents}     – document metadata list.</li>
 *   <li>{@code GET  /api/admin/permits/{id}/license}       – stream the regenerated Gas Selling Permit PDF.</li>
 *   <li>{@code POST /api/admin/permits/{id}/approve}       – approve + upload licence PDF.</li>
 *   <li>{@code POST /api/admin/permits/{id}/reject}        – reject with reason.</li>
 * </ul>
 *
 * <p>The document <em>bytes</em> are streamed by the seller-facing
 * {@code GET /api/permits/documents/{id}} endpoint; admin tokens are
 * allowed there too. Centralising the stream in one controller keeps the
 * role/ownership guard in a single place.</p>
 */
@RestController
@RequestMapping("/api/admin/permits")
public class AdminPermitController {

    private final PermitService permitService;
    private final SellerApplicationPdfService pdfService;

    public AdminPermitController(PermitService permitService,
                                 SellerApplicationPdfService pdfService) {
        this.permitService = permitService;
        this.pdfService = pdfService;
    }

    @GetMapping
    public List<SellerPermitDto> list(
            HttpServletRequest request,
            // Explicit name "status" — keeps the binding stable even if the
            // build is run without `-parameters`, and matches the query
            // string the admin filter UI sends.
            @RequestParam(name = "status", required = false) String status
    ) {
        requireAdmin(request);
        PermitStatus filter = status == null || status.isBlank()
                ? null
                : parseStatus(status);
        return permitService.listForAdmin(filter);
    }

    @GetMapping("/{id}")
    public SellerPermitDto get(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id
    ) {
        requireAdmin(request);
        return permitService.getForAdmin(id);
    }

    @GetMapping("/{id}/documents")
    public List<PermitDocumentDto> listDocuments(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id
    ) {
        requireAdmin(request);
        return permitService.listDocumentsForAdmin(id);
    }

    /**
     * Stream the official Gas Selling Permit PDF for an APPROVED permit.
     * Mirrors the seller-facing {@code GET /api/permits/me/license}, but
     * is admin-gated so the administrator can view / re-download the
     * issued licence without impersonating the seller. The PDF is
     * regenerated on demand by {@link SellerApplicationPdfService}, so
     * it always reflects the latest application and review data — even
     * when no admin-uploaded licence file was attached at approval time.
     */
    @GetMapping("/{id}/license")
    public ResponseEntity<byte[]> downloadLicense(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id
    ) {
        requireAdmin(request);
        SellerPermitDto permit = permitService.getForAdmin(id);
        if (!"approved".equalsIgnoreCase(permit.status())) {
            throw new com.project.gas_delivery.permit.exception.PermitStateException(
                    "Gas Selling Permit is only available for approved applications.");
        }
        // SellerPermitDto.sellerId is the JSON-stringified Long from the
        // DTO record; buildIssuedLicenseData wants the raw Long.
        Long sellerId = Long.parseLong(permit.sellerId());
        SellerApplicationPdfService.IssuedLicenseData data =
                permitService.buildIssuedLicenseData(sellerId);
        byte[] body = pdfService.renderIssuedLicense(data);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(body.length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"seller-licence-" + permit.sellerId() + ".pdf\"")
                .body(body);
    }

    @PostMapping(
            value = "/{id}/approve",
            consumes = { MediaType.MULTIPART_FORM_DATA_VALUE, MediaType.APPLICATION_JSON_VALUE }
    )
    public SellerPermitDto approve(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id,
            // Only meaningful when the request arrives as multipart/form-data.
            // A JSON request carries no `license` part and the parameter is
            // simply left null — the existing service already handles a null
            // licence by skipping the admin-uploaded PDF store step. The
            // issued permit PDF is regenerated on demand by the seller-facing
            // /api/permits/me/license endpoint regardless of this branch.
            @RequestParam(value = "license", required = false) MultipartFile license
    ) {
        Long adminId = requireAdmin(request);
        return permitService.approve(id, adminId, license);
    }

    @PostMapping(value = "/{id}/reject", consumes = MediaType.APPLICATION_JSON_VALUE)
    public SellerPermitDto reject(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id,
            @Valid @RequestBody RejectPermitRequest body
    ) {
        Long adminId = requireAdmin(request);
        return permitService.reject(id, adminId, body);
    }

    private static Long requireAdmin(HttpServletRequest request) {
        return AdminGuard.requireAdmin(request);
    }

    private static PermitStatus parseStatus(String raw) {
        try {
            return PermitStatus.fromJson(raw);
        } catch (IllegalArgumentException e) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    "Unknown permit status: " + raw);
        }
    }
}
