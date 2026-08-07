package com.project.gas_delivery.admin.controller;

import com.project.gas_delivery.admin.AdminGuard;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.permit.dto.SupplierApplicationDocumentDto;
import com.project.gas_delivery.permit.dto.SupplierApplicationDto;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.service.SupplierApplicationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
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

import java.util.List;

/**
 * Admin endpoints for the supplier verification workflow.
 *
 * <ul>
 *   <li>{@code GET  /api/admin/supplier-applications?status=}          – review queue.</li>
 *   <li>{@code GET  /api/admin/supplier-applications/{id}}             – single application.</li>
 *   <li>{@code GET  /api/admin/supplier-applications/{id}/documents}   – document metadata.</li>
 *   <li>{@code GET  /api/admin/supplier-applications/{id}/certificate} – stream the official
 *       Gas Supplier Certificate PDF (APPROVED only).</li>
 *   <li>{@code POST /api/admin/supplier-applications/{id}/approve}     – approve.</li>
 *   <li>{@code POST /api/admin/supplier-applications/{id}/reject}      – reject with reason.</li>
 * </ul>
 *
 * <p>The document <em>bytes</em> are streamed by the supplier-facing
 * {@code GET /api/supplier-applications/documents/{id}} endpoint; admin
 * tokens are allowed there too. Centralising the stream in one place
 * keeps the role/ownership guard in a single method.</p>
 */
@RestController
@RequestMapping("/api/admin/supplier-applications")
public class AdminSupplierApplicationController {

    private final SupplierApplicationService supplierApplicationService;

    public AdminSupplierApplicationController(
            SupplierApplicationService supplierApplicationService
    ) {
        this.supplierApplicationService = supplierApplicationService;
    }

    @GetMapping
    public List<SupplierApplicationDto> list(
            HttpServletRequest request,
            @RequestParam(name = "status", required = false) String status
    ) {
        AdminGuard.requireAdmin(request);
        PermitStatus filter = (status == null || status.isBlank())
                ? null
                : parseStatus(status);
        return supplierApplicationService.listForAdmin(filter);
    }

    @GetMapping("/{id}")
    public SupplierApplicationDto get(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id
    ) {
        AdminGuard.requireAdmin(request);
        return supplierApplicationService.getForAdmin(id);
    }

    @GetMapping("/{id}/documents")
    public List<SupplierApplicationDocumentDto> listDocuments(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id
    ) {
        AdminGuard.requireAdmin(request);
        return supplierApplicationService.listDocumentsForAdmin(id);
    }

    /**
     * Stream the official Gas Supplier Certificate PDF for an APPROVED
     * application. Mirrors the supplier-facing
     * {@code GET /api/supplier-applications/me/certificate}, but is
     * admin-gated so the administrator can view / re-download the issued
     * certificate without impersonating the supplier. The service throws
     * HTTP 409 when the application is not yet approved.
     */
    @GetMapping("/{id}/certificate")
    public ResponseEntity<byte[]> downloadCertificate(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id
    ) {
        AdminGuard.requireAdmin(request);
        byte[] body = supplierApplicationService.renderCertificateForApplication(id);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(body.length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"supplier-certificate-app-" + id + ".pdf\"")
                .body(body);
    }

    @PostMapping("/{id}/approve")
    public SupplierApplicationDto approve(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id
    ) {
        Long adminId = AdminGuard.requireAdmin(request);
        return supplierApplicationService.approve(id, adminId);
    }

    @PostMapping(value = "/{id}/reject", consumes = MediaType.APPLICATION_JSON_VALUE)
    public SupplierApplicationDto reject(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id,
            @RequestBody RejectSupplierApplicationRequest body
    ) {
        Long adminId = AdminGuard.requireAdmin(request);
        if (body == null || body.reason() == null) {
            throw new BadRequestException("reason is required.");
        }
        return supplierApplicationService.reject(id, adminId, body.reason());
    }

    private static PermitStatus parseStatus(String raw) {
        try {
            return PermitStatus.fromJson(raw);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Unknown permit status: " + raw);
        }
    }

    /**
     * Payload for {@code POST /api/admin/supplier-applications/{id}/reject}.
     * The {@code reason} becomes the supplier-facing rejection message
     * and is persisted on {@code supplier_applications.rejection_reason}.
     */
    public record RejectSupplierApplicationRequest(
            @NotBlank(message = "reason is required")
            @Size(min = 5, max = 1000, message = "reason must be between 5 and 1000 characters")
            String reason
    ) {
    }
}
