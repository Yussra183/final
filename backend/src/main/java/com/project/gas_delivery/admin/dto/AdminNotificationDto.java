package com.project.gas_delivery.admin.dto;

import com.project.gas_delivery.notification.entity.NotificationEntity;

import java.time.Instant;

/**
 * A notification row for the admin log — every user's feed, with the
 * recipient's name resolved from a single batched {@code users} lookup
 * per page rather than one query per row.
 */
public record AdminNotificationDto(
        String id,
        String userId,
        String userName,
        String type,
        String title,
        String message,
        boolean read,
        Instant createdAt
) {

    public static AdminNotificationDto from(NotificationEntity e, String userName) {
        return new AdminNotificationDto(
                String.valueOf(e.getId()),
                String.valueOf(e.getUserId()),
                userName,
                e.getType(),
                e.getTitle(),
                e.getMessage(),
                e.isRead(),
                e.getCreatedAt()
        );
    }
}
