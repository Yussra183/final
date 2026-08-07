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
import com.project.gas_delivery.seller.entity.SellerProfileEntity;
import com.project.gas_delivery.seller.repository.SellerProfileRepository;
import com.project.gas_delivery.seller.service.GeocodingService;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
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
 *
 * <p><strong>Seller registration (V12):</strong> when the role is
 * {@link Role#SELLER} and the request carries any of the optional
 * business fields, we create the {@code seller_profiles} row in the
 * same transaction. The user row and the seller profile row commit
 * together or not at all — no more "Welcome aboard!" behind a
 * silently-failed second request that left the seller with no
 * address.</p>
 */
@Service
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final SessionService sessionService;
    private final SellerProfileRepository sellerProfileRepository;
    private final GeocodingService geocodingService;

    public AuthServiceImpl(UserRepository userRepository,
                           PasswordEncoder passwordEncoder,
                           SessionService sessionService,
                           SellerProfileRepository sellerProfileRepository,
                           GeocodingService geocodingService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.sessionService = sessionService;
        this.sellerProfileRepository = sellerProfileRepository;
        this.geocodingService = geocodingService;
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

        // ---- Seller business profile (atomic) ----
        // When the registration carries business fields, persist them
        // inside this same transaction so the seller logs in to find
        // their typed address, not "Address not set". The fields stay
        // optional so legacy / curl / smoke-test registrations that
        // omit them still succeed — the seller can fill in the address
        // later via the dashboard and `SellerProfileService.upsertMe`.
        if (request.role() == Role.SELLER
                && hasAnyBusinessField(request)) {
            createSellerProfile(saved, request);
        }

        String token = issueToken(saved);
        sessionService.register(token, saved.getId());
        return AuthResponse.of(saved, token);
    }

    /**
     * True when the registration payload carries at least one of the
     * optional business fields. We only create a {@code seller_profiles}
     * row in that case; a fully-empty payload means the seller didn't
     * fill in the form (or is using a non-UI client) and the lazy
     * {@code SellerProfileService.me()} path will still materialise a
     * placeholder row on first dashboard load.
     */
    private static boolean hasAnyBusinessField(RegisterRequest r) {
        return notBlank(r.businessName()) || notBlank(r.businessAddress())
                || notBlank(r.businessRegion()) || notBlank(r.businessDistrict())
                || notBlank(r.businessWard()) || notBlank(r.businessStreet())
                || r.businessLat() != null || r.businessLng() != null;
    }

    private static boolean notBlank(String v) {
        return v != null && !v.trim().isEmpty();
    }

    /**
     * Build the {@code seller_profiles} row from a registration payload.
     * Coordinates resolve to a real location when the seller typed
     * them, otherwise the existing {@link GeocodingService} turns the
     * typed address into one. The whole operation runs inside the
     * {@link #register} transaction — if anything throws, the user row
     * rolls back too, so we never end up with a half-registered seller.
     */
    private void createSellerProfile(User user, RegisterRequest r) {
        Double lat = r.businessLat();
        Double lng = r.businessLng();
        if (lat != null && lng != null) {
            // Mirror the seller-side range check: reject obviously
            // bogus input at registration time rather than letting it
            // surface later as "could not resolve address".
            if (lat < -90.0 || lat > 90.0 || lng < -180.0 || lng > 180.0
                    || (lat == 0.0 && lng == 0.0)) {
                throw new BadRequestException(
                        "Business coordinates are out of range or (0, 0).");
            }
        } else if (notBlank(r.businessAddress())) {
            Optional<GeocodingService.Coordinates> resolved =
                    geocodingService.resolve(r.businessAddress().trim());
            if (resolved.isPresent()) {
                lat = resolved.get().lat();
                lng = resolved.get().lng();
            }
        }

        SellerProfileEntity profile = new SellerProfileEntity(
                user.getId(),
                notBlank(r.businessName()) ? r.businessName().trim()
                        : user.getFullName() + "'s Shop",
                notBlank(r.businessAddress()) ? r.businessAddress().trim()
                        : "Address not set",
                trimOrNull(r.businessDistrict()),
                trimOrNull(r.businessRegion()),
                trimOrNull(r.businessWard()),
                trimOrNull(r.businessStreet()),
                lat,
                lng,
                user.getPhone(),
                BigDecimal.ZERO,
                true
        );
        sellerProfileRepository.save(profile);
    }

    private static String trimOrNull(String v) {
        return v == null || v.trim().isEmpty() ? null : v.trim();
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
