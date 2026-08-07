package com.project.gas_delivery.notification.service;

import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.auth.exception.ResourceNotFoundException;
import com.project.gas_delivery.notification.dto.NotificationDto;
import com.project.gas_delivery.notification.entity.NotificationEntity;
import com.project.gas_delivery.notification.repository.NotificationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Persistent notification feed. The single funnel every module uses to
 * notify a user — {@code OrderServiceImpl}, {@code PermitService}, and any
 * future flows call into this class so the wire shape stays consistent.
 */
@Service
public class NotificationService {

    private final NotificationRepository notificationRepository;

    public NotificationService(NotificationRepository notificationRepository) {
        this.notificationRepository = notificationRepository;
    }

    /**
     * Persist a new notification for a single user.
     *
     * @param userId    recipient
     * @param type      short tag (e.g. {@code "permit"}, {@code "order"})
     * @param title     short headline
     * @param message   body text
     * @param data      optional JSON metadata blob (raw JSON string)
     */
    @Transactional
    public NotificationDto notify(Long userId, String type, String title, String message, String data) {
        NotificationEntity entity = new NotificationEntity(userId, type, title, message, data);
        return NotificationDto.from(notificationRepository.save(entity));
    }

    /** List the current user's notifications, newest first. */
    @Transactional(readOnly = true)
    public List<NotificationDto> listForUser(Long userId) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(NotificationDto::from)
                .toList();
    }

    /** Mark a single notification read. Enforces ownership. */
    @Transactional
    public NotificationDto markRead(Long notificationId, Long actorId) {
        NotificationEntity entity = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Notification " + notificationId + " not found."));
        if (!entity.getUserId().equals(actorId)) {
            // Treat as not-found to avoid leaking notification ids across users.
            throw new ResourceNotFoundException("Notification " + notificationId + " not found.");
        }
        if (!entity.isRead()) {
            entity.setRead(true);
            entity = notificationRepository.save(entity);
        }
        return NotificationDto.from(entity);
    }

    @Transactional
    public int markAllRead(Long userId) {
        return notificationRepository.markAllRead(userId);
    }

    @Transactional(readOnly = true)
    public long unreadCount(Long userId) {
        return notificationRepository.countByUserIdAndReadFalse(userId);
    }

    /** Tiny convenience used by services that need to verify they have an actor. */
    public static void requireActor(Long actorId) {
        if (actorId == null) {
            throw new BadRequestException("Authenticated actor is required.");
        }
    }
}
