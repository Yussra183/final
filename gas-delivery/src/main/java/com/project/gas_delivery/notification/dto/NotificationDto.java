package com.project.gas_delivery.notification.dto;

import com.project.gas_delivery.notification.entity.NotificationEntity;

import java.time.Instant;

/**
 * Wire form of a {@code notifications} row. Mirrors the frontend's
 * {@code NotificationItem} interface in {@code constants/types.ts}.
 *
 * <p>Field names are deliberately camelCase — they match the React Native
 * type and the record component names map to JSON properties verbatim via
 * Jackson.</p>
 */
public record NotificationDto(
        String id,
        String userId,
        String type,
        String title,
        String message,
        String data,
        boolean read,
        Instant createdAt
) {

    public static NotificationDto from(NotificationEntity entity) {
        return new NotificationDto(
                String.valueOf(entity.getId()),
                String.valueOf(entity.getUserId()),
                entity.getType(),
                entity.getTitle(),
                entity.getMessage(),
                entity.getData(),
                entity.isRead(),
                entity.getCreatedAt()
        );
    }
}
