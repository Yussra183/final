package com.project.gas_delivery.admin.controller;

import com.project.gas_delivery.admin.AdminGuard;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.permit.dto.RiderPermitDocumentDto;
import com.project.gas_delivery.permit.dto.RiderPermitDto;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.exception.PermitNotFoundException;
import com.project.gas_delivery.permit.exception.PermitStateException;
import com.project.gas_delivery.permit.service.RiderPermitService;
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
 * Admin endpoints for the rider verification workflow.
 *
 * <ul>
 *   <li>{@code GET  /api/admin/rider-permits?status=}            – review queue.</li>
 *   <li>{@code GET  /api/admin/rider-permits/{id}}               – single application.</li>
 *   <li>{@code GET  /api/admin/rider-permits/{id}/documents}     – document metadata.</li>
 *   <li>{@code GET  /api/admin/rider-permits/{id}/certificate}   – stream the official
 *       Gas Delivery Rider Certificate PDF (APPROVED only).</li>
 *   <li>{@code POST /api/admin/rider-permits/{id}/approve}       – approve the application.</li>
 *   <li>{@code POST /api/admin/rider-permits/{id}/reject}        – reject with reason.</li>
 * </ul>
 *
 * <p>The document <em>bytes</em> are streamed by the rider-facing
 * {@code GET /api/rider-permits/documents/{id}} endpoint; admin
 * tokens are allowed there too. Centralising the stream in one
 * controller keeps the role/ownership guard in a single place.</p>
 */
@RestController
@RequestMapping("/api/admin/rider-permits")
public class AdminRiderApplicationController {

    private final RiderPermitService riderPermitService;

    public AdminRiderApplicationController(RiderPermitService riderPermitService) {
        this.riderPermitService = riderPermitService;
    }

    @GetMapping
    public List<RiderPermitDto> list(
            HttpServletRequest request,
            @RequestParam(name = "status", required = false) String status
    ) {
        requireAdmin(request);
        PermitStatus filter = (status == null || status.isBlank())
                ? null
                : parseStatus(status);
        return riderPermitService.listForAdmin(filter);
    }

    @GetMapping("/{id}")
    public RiderPermitDto get(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id
    ) {
        requireAdmin(request);
        return riderPermitService.getForAdmin(id);
    }

    @GetMapping("/{id}/documents")
    public List<RiderPermitDocumentDto> listDocuments(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id
    ) {
        requireAdmin(request);
        return riderPermitService.listDocumentsForAdmin(id);
    }

    /**
     * Stream the official Gas Delivery Rider Certificate PDF for an
     * APPROVED application. Mirrors the rider-facing
     * {@code GET /api/rider-permits/me/certificate}, but is admin-gated
     * so the administrator can view / re-download the issued certificate
     * without impersonating the rider.
     */
    @GetMapping("/{id}/certificate")
    public ResponseEntity<byte[]> downloadCertificate(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id
    ) {
        requireAdmin(request);
        RiderPermitDto permit = riderPermitService.getForAdmin(id);
        if (!"approved".equalsIgnoreCase(permit.status())) {
            throw new PermitStateException(
                    "Gas Delivery Rider Certificate is only available for approved applications.");
        }
        Long riderId = Long.parseLong(permit.riderId());
        byte[] body = riderPermitService.renderCertificate(riderId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(body.length)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"rider-permit-" + riderId + ".pdf\"")
                .body(body);
    }

    @PostMapping("/{id}/approve")
    public RiderPermitDto approve(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id
    ) {
        Long adminId = requireAdmin(request);
        return riderPermitService.approve(id, adminId);
    }

    @PostMapping(value = "/{id}/reject", consumes = MediaType.APPLICATION_JSON_VALUE)
    public RiderPermitDto reject(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id,
            @RequestBody RejectRiderApplicationRequest body
    ) {
        Long adminId = requireAdmin(request);
        if (body == null || body.reason() == null) {
            throw new BadRequestException("reason is required.");
        }
        return riderPermitService.reject(id, adminId, body.reason());
    }

    private static Long requireAdmin(HttpServletRequest request) {
        return AdminGuard.requireAdmin(request);
    }

    private static PermitStatus parseStatus(String raw) {
        try {
            return PermitStatus.fromJson(raw);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Unknown permit status: " + raw);
        }
    }

    /**
     * Payload for {@code POST /api/admin/rider-permits/{id}/reject}.
     * The {@code reason} becomes the rider-facing rejection message
     * and is persisted on {@code rider_applications.rejection_reason}.
     */
    public record RejectRiderApplicationRequest(
            @NotBlank(message = "reason is required")
            @Size(min = 5, max = 1000, message = "reason must be between 5 and 1000 characters")
            String reason
    ) {
    }
}