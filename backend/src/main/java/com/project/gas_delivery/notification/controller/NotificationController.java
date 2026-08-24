package com.project.gas_delivery.notification.controller;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.security.AuthFilter;
import com.project.gas_delivery.notification.dto.NotificationDto;
import com.project.gas_delivery.notification.service.NotificationService;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Endpoints backing the in-app notification feed consumed by every role's
 * {@code notifications.tsx}.
 *
 * <ul>
 *   <li>{@code GET /api/notifications}               – list the actor's
 *                                                        notifications,
 *                                                        newest first.</li>
 *   <li>{@code PATCH /api/notifications/{id}/read}    – mark one read.</li>
 *   <li>{@code POST /api/notifications/read-all}      – mark every
 *                                                        notification read
 *                                                        in a single call.</li>
 *   <li>{@code DELETE /api/notifications/{id}}        – delete one
 *                                                        notification the
 *                                                        actor owns.
 *                                                        Ownership is
 *                                                        enforced server-side
 *                                                        so a user can only
 *                                                        remove their own
 *                                                        rows; already-read
 *                                                        notifications are
 *                                                        deletable too.</li>
 * </ul>
 *
 * The actor must be authenticated — the same {@link AuthFilter} that gates
 * every other protected endpoint. Suppliers and admins share the same
 * endpoints; the rows are always scoped by {@code user_id}.
 */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public List<NotificationDto> list(HttpServletRequest request) {
        Long actorId = requireActor(request);
        return notificationService.listForUser(actorId);
    }

    @PatchMapping("/{id}/read")
    public NotificationDto markRead(HttpServletRequest request, @PathVariable Long id) {
        Long actorId = requireActor(request);
        return notificationService.markRead(id, actorId);
    }

    @PostMapping("/read-all")
    public Map<String, Object> markAllRead(HttpServletRequest request) {
        Long actorId = requireActor(request);
        int updated = notificationService.markAllRead(actorId);
        return Map.of("updated", updated);
    }

    /**
     * Delete a single notification owned by the actor.
     *
     * <p>Returns 204 No Content on success. The service layer enforces
     * ownership — cross-user deletes resolve to 404, identical to
     * {@code markRead} — so this endpoint is safe to expose without a
     * role check. Authentication is unchanged; read/unread logic is
     * untouched; only the targeted row is removed.</p>
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(HttpServletRequest request, @PathVariable Long id) {
        Long actorId = requireActor(request);
        notificationService.delete(id, actorId);
        return ResponseEntity.noContent().build();
    }

    private static Long requireActor(HttpServletRequest request) {
        Long actorId = AuthFilter.currentActorId(request);
        Role role = AuthFilter.currentActorRole(request);
        if (actorId == null || role == null) {
            throw new NotAuthorizedException("Authentication required.");
        }
        return actorId;
    }
}
