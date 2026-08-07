package com.project.gas_delivery.permit.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.permit.dto.RiderPermitDto;
import com.project.gas_delivery.permit.service.RiderPermitService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Rider-facing permit endpoints.
 *
 * <ul>
 *   <li>{@code GET /api/riders/me/permit}            – the signed-in
 *       rider's permit summary (404 when no permit row exists yet, so
 *       the frontend can show the "not yet issued" message).</li>
 *   <li>{@code GET /api/riders/me/permit/certificate} – stream the
 *       rider's official permit certificate as a PDF (404 when no
 *       permit, 409 when the permit is not yet APPROVED).</li>
 * </ul>
 *
 * <p>Both endpoints require the actor to be a RIDER — the actor id is
 * resolved from the bearer-token-resolved request attribute, never a
 * path variable, so a rider can never request another rider's permit.</p>
 */
@RestController
@RequestMapping("/api/riders/me/permit")
public class RiderPermitController {

    private final RiderPermitService riderPermitService;

    public RiderPermitController(RiderPermitService riderPermitService) {
        this.riderPermitService = riderPermitService;
    }

    @GetMapping
    public RiderPermitDto myPermit(HttpServletRequest request) {
        Long riderId = requireRider(request);
        return riderPermitService.getForRider(riderId);
    }

    @GetMapping("/certificate")
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

    private static Long requireRider(HttpServletRequest request) {
        Long actorId = AuthFilter.currentActorId(request);
        Role role = AuthFilter.currentActorRole(request);
        if (actorId == null || role == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        if (role != Role.RIDER) {
            throw new NotAuthorizedException(
                    "Only riders can view their rider permit certificate.");
        }
        return actorId;
    }
}