package com.project.gas_delivery.auth.service.impl;

import com.project.gas_delivery.auth.dto.AuthResponse;
import com.project.gas_delivery.auth.dto.LoginRequest;
import com.project.gas_delivery.auth.dto.RegisterRequest;
import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.auth.service.AuthService;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

/**
 * Default implementation of {@link AuthService}.
 * <p>
 * Tokens are currently random opaque strings (UUID v4). When JWT lands,
 * replace {@link #issueToken(User)} with a signed-token generator — the
 * rest of the application talks to {@link AuthResponse} and stays
 * unchanged.
 * </p>
 */
@Service
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AuthServiceImpl(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = normalise(request.email());
        String username = normalise(request.username());

        if (userRepository.existsByEmail(email)) {
            throw new BadRequestException("Email is already registered");
        }
        if (userRepository.existsByUsername(username)) {
            throw new BadRequestException("Username is already taken");
        }

        User user = new User(
                request.fullName().trim(),
                username,
                email,
                passwordEncoder.encode(request.password()),
                request.phone() == null ? null : request.phone().trim(),
                request.role()
        );
        User saved = userRepository.save(user);
        return AuthResponse.of(saved, issueToken(saved));
    }

    @Override
    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        String identifier = normalise(request.identifier());

        Optional<User> found = identifier.contains("@")
                ? userRepository.findByEmail(identifier)
                : userRepository.findByUsername(identifier);

        User user = found.orElseThrow(() ->
                new BadCredentialsException("Invalid username/email or password"));

        if (!user.isActive()) {
            throw new BadCredentialsException("Account is disabled");
        }

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BadCredentialsException("Invalid username/email or password");
        }

        return AuthResponse.of(user, issueToken(user));
    }

    // --- helpers ---

    private static String normalise(String s) {
        return s == null ? "" : s.trim().toLowerCase();
    }

    private static String issueToken(User user) {
        // Opaque placeholder token. Replaced by a signed JWT in a later step.
        return "tok_" + UUID.randomUUID();
    }
}