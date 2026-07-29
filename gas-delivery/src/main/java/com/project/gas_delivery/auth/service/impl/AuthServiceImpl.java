package com.project.gas_delivery.auth.service.impl;

import com.project.gas_delivery.auth.dto.AuthResponse;
import com.project.gas_delivery.auth.dto.LoginRequest;
import com.project.gas_delivery.auth.dto.RegisterRequest;
import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.auth.service.AuthService;
import com.project.gas_delivery.auth.service.SessionService;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

/**
 * Default implementation of {@link AuthService}.
 * <p>
 * Tokens are currently random opaque strings ({@code "tok_<uuid>"}),
 * registered against the {@link SessionService} so the Order Flow (and any
 * other module) can resolve {@code Authorization: Bearer <token>} to the
 * acting user. When JWT lands, replace {@link #issueToken(User)} with a
 * signed-token generator — the rest of the application talks to
 * {@link AuthResponse} and stays unchanged.
 * </p>
 */
@Service
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final SessionService sessionService;

    public AuthServiceImpl(UserRepository userRepository,
                           PasswordEncoder passwordEncoder,
                           SessionService sessionService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.sessionService = sessionService;
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
        // Permit gating (added with the seller verification workflow):
        // a freshly registered SELLER must not appear to customers or
        // receive orders until an administrator approves their permit
        // application. Non-seller roles (CUSTOMER, RIDER, SUPPLIER, ADMIN)
        // remain active by default. The seller is still allowed to log in
        // straight after registration — see {@link #login(LoginRequest)}.
        if (request.role() == Role.SELLER) {
            user.setActive(false);
        }
        User saved = userRepository.save(user);
        String token = issueToken(saved);
        sessionService.register(token, saved.getId());
        return AuthResponse.of(saved, token);
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

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BadCredentialsException("Invalid username/email or password");
        }

        // Password is correct at this point. Pending sellers are allowed
        // to log in so they can complete their permit application from
        // the seller portal — admin approval is only required before the
        // seller can conduct business (appear in the customer list,
        // accept orders, update stock). Those downstream gates
        // (SellerProfileService.listAll, OrderServiceImpl.create,
        // ProductService.updateStock, the seller layout drawer) already
        // use `users.is_active` and the permit status, so unlocking
        // login here is sufficient — no extra "is active" check is
        // needed on the seller path.
        //
        // Non-seller inactive accounts (legacy admin-disabled) keep the
        // original bad-credentials fallback so the seller-specific
        // branches above it stay un-branched.
        if (!user.isActive() && user.getRole() != Role.SELLER) {
            throw new BadCredentialsException("Account is disabled");
        }

        String token = issueToken(user);
        sessionService.register(token, user.getId());
        return AuthResponse.of(user, token);
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
