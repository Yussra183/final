package com.project.gas_delivery.admin.controller;

import com.project.gas_delivery.admin.AdminGuard;
import com.project.gas_delivery.admin.dto.AdminUserDto;
import com.project.gas_delivery.admin.service.AdminReadService;
import com.project.gas_delivery.admin.service.AdminUserWriteService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Admin-only user write surface — soft-deactivate, reactivate, and
 * hard-delete a Seller / Rider / Supplier account.
 *
 * <p>Mirrors the {@link AdminDirectoryController} pattern: every
 * handler injects {@link HttpServletRequest} and calls
 * {@link AdminGuard#requireAdmin(HttpServletRequest)} as the first
 * statement, so the role gate runs before the service can be
 * reached. There is no {@code @PreAuthorize} and no
 * {@code SecurityConfig} change — the same proven path used by every
 * other admin endpoint.</p>
 *
 * <h2>Authorization model</h2>
 * <ul>
 *   <li>Caller must hold a session whose
 *       {@link com.project.gas_delivery.auth.enums.Role} is
 *       {@code ADMIN}.</li>
 *   <li>Target must be {@code SELLER}, {@code RIDER}, or
 *       {@code SUPPLIER}. ADMIN and CUSTOMER targets are rejected by
 *       the service layer with a {@code 400 Bad Request}, even if the
 *       caller somehow obtains an admin session.</li>
 * </ul>
 *
 * <h2>Endpoints</h2>
 * <ul>
 *   <li>{@code POST /api/admin/users/{id}/deactivate} — body
 *       {@code { "reason": "..." }} soft-deactivates the account and
 *       logs out any live session. Returns {@code 200 OK} with the
 *       updated {@link AdminUserDto}.</li>
 *   <li>{@code POST /api/admin/users/{id}/reactivate} — no body.
 *       Returns {@code 200 OK} with the updated {@link AdminUserDto}.</li>
 *   <li>{@code DELETE /api/admin/users/{id}} — hard-deletes the
 *       {@code users} row. Returns {@code 200 OK} with the deleted id
 *       wrapped in a {@code {id}} envelope.</li>
 * </ul>
 *
 * <p>All three endpoints can return {@code 409 Conflict} when the
 * target still owns in-flight transactions; the response body's
 * {@code code} field carries the specific blocker
 * (e.g. {@code ACTIVE_ORDERS}, {@code ACTIVE_DELIVERIES},
 * {@code ACTIVE_SUPPLY_ORDERS}).</p>
 */
@RestController
@RequestMapping("/api/admin/users")
public class AdminUserWriteController {

    private final AdminUserWriteService adminUserWriteService;
    private final AdminReadService adminReadService;

    public AdminUserWriteController(AdminUserWriteService adminUserWriteService,
                                   AdminReadService adminReadService) {
        this.adminUserWriteService = adminUserWriteService;
        this.adminReadService = adminReadService;
    }

    /**
     * Soft-deactivate (ban-lite) the given user. The account stays in
     * the database with the audit fields populated and any future login
     * is rejected. Use {@link #reactivate(Long, HttpServletRequest)} to
     * reverse.
     */
    @PostMapping("/{id}/deactivate")
    public AdminUserDto deactivate(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id,
            @RequestBody(required = false) DeactivateBody body
    ) {
        Long adminId = AdminGuard.requireAdmin(request);
        String reason = body == null ? null : body.reason();
        adminUserWriteService.deactivate(id, adminId, reason);
        return adminReadService.user(id);
    }

    /**
     * Reverse a prior {@link #deactivate}. Idempotent — calling it on
     * an already-active account is a no-op (returns the current row).
     */
    @PostMapping("/{id}/reactivate")
    public AdminUserDto reactivate(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id
    ) {
        Long adminId = AdminGuard.requireAdmin(request);
        adminUserWriteService.reactivate(id, adminId);
        return adminReadService.user(id);
    }

    /**
     * Hard-delete the {@code users} row. Refuses if the user still
     * owns in-flight transactions; the response carries the specific
     * blocker in {@code code}. On success, returns the deleted id in
     * a small envelope so the frontend can remove it from its list.
     */
    @DeleteMapping("/{id}")
    public Map<String, Object> delete(
            HttpServletRequest request,
            @PathVariable(name = "id") Long id
    ) {
        Long adminId = AdminGuard.requireAdmin(request);
        adminUserWriteService.delete(id, adminId);
        return Map.of("id", id, "deleted", true);
    }

    /**
     * Tiny request body for {@link #deactivate}. The reason is
     * optional; null / blank is accepted (the audit row stores
     * {@code NULL}).
     */
    public static final class DeactivateBody {
        private String reason;
        public String reason() { return reason; }
        public void setReason(String reason) { this.reason = reason; }
    }
}
