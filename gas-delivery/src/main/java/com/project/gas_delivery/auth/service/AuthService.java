package com.project.gas_delivery.auth.service;

import com.project.gas_delivery.auth.dto.AuthResponse;
import com.project.gas_delivery.auth.dto.LoginRequest;
import com.project.gas_delivery.auth.dto.RegisterRequest;

/**
 * Business operations for the authentication module.
 */
public interface AuthService {

    /** Registers a new user and returns their record + session token. */
    AuthResponse register(RegisterRequest request);

    /** Verifies credentials (username or email + password) and returns a session token. */
    AuthResponse login(LoginRequest request);
}