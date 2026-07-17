package com.project.gas_delivery.auth.dto;

/**
 * Generic single-message response.
 */
public record MessageResponse(String message) {
    public static MessageResponse of(String message) {
        return new MessageResponse(message);
    }
}