package com.project.gas_delivery.admin.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.permit.dto.PermitDocumentDto;
import com.project.gas_delivery.permit.dto.RejectPermitRequest;
import com.project.gas_delivery.permit.dto.SellerPermitDto;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.service.PermitService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
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

    public AdminPermitController(PermitService permitService) {
        this.permitService = permitService;
    }

    @GetMapping
    public List<SellerPermitDto> list(
            HttpServletRequest request,
            @RequestParam(required = false) String status
    ) {
        Long adminId = requireAdmin(request);
        PermitStatus filter = status == null || status.isBlank()
                ? null
                : parseStatus(status);
        return permitService.listForAdmin(filter);
    }

    @GetMapping("/{id}")
    public SellerPermitDto get(HttpServletRequest request, @PathVariable Long id) {
        requireAdmin(request);
        return permitService.getForAdmin(id);
    }

    @GetMapping("/{id}/documents")
    public List<PermitDocumentDto> listDocuments(
            HttpServletRequest request,
            @PathVariable Long id
    ) {
        requireAdmin(request);
        return permitService.listDocumentsForAdmin(id);
    }

    @PostMapping(value = "/{id}/approve", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SellerPermitDto approve(
            HttpServletRequest request,
            @PathVariable Long id,
            @RequestParam(value = "license", required = false) MultipartFile license
    ) {
        Long adminId = requireAdmin(request);
        return permitService.approve(id, adminId, license);
    }

    @PostMapping(value = "/{id}/reject", consumes = MediaType.APPLICATION_JSON_VALUE)
    public SellerPermitDto reject(
            HttpServletRequest request,
            @PathVariable Long id,
            @Valid @RequestBody RejectPermitRequest body
    ) {
        Long adminId = requireAdmin(request);
        return permitService.reject(id, adminId, body);
    }

    private static Long requireAdmin(HttpServletRequest request) {
        Long actorId = AuthFilter.currentActorId(request);
        Role role = AuthFilter.currentActorRole(request);
        if (actorId == null || role == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        if (role != Role.ADMIN) {
            throw new NotAuthorizedException("Only administrators can manage permit applications.");
        }
        return actorId;
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
