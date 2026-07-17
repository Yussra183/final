package com.project.gas_delivery.auth.dto;

import com.project.gas_delivery.auth.entity.User;

/**
 * Successful authentication payload — shape matches the frontend's
 * {@code AuthSession} interface ({@code { user, token }}).
 * <p>
 * The token is currently a random opaque string. When the JWT phase
 * lands, only this class and the service implementation need to change
 * — the wire contract stays identical.
 * </p>
 */
public record AuthResponse(UserDto user, String token) {

    public static AuthResponse of(User user, String token) {
        return new AuthResponse(UserDto.from(user), token);
    }
}