package com.project.gas_delivery.auth.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory resolver for opaque session tokens issued by
 * {@code AuthServiceImpl.issueToken(...)}.
 *
 * <p>Tokens are currently random opaque strings ({@code "tok_<uuid>"}) and
 * are NOT signed. When the JWT phase lands this class swaps out for a
 * signed-token verifier — the rest of the application talks to
 * {@link #resolve(String)}, {@link #userIdOf(String)}, and
 * {@link #roleOf(String)}, so the call sites stay unchanged.</p>
 *
 * <p>Backed by a {@link ConcurrentHashMap} so it is safe for the parallel
 * request load Spring's default servlet container produces. Sufficient for
 * MVP — when the backend grows past a single instance this is one of the
 * first things to migrate to Redis.</p>
 */
@Service
public class SessionService {

    private final UserRepository userRepository;

    /** token → userId. */
    private final ConcurrentHashMap<String, Long> tokens = new ConcurrentHashMap<>();

    public SessionService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * Register a freshly issued token against a user. Called by
     * {@code AuthServiceImpl} on register/login.
     */
    public void register(String token, Long userId) {
        tokens.put(token, userId);
    }

    /**
     * Look up the full {@link User} row for a token. Returns {@link Optional#empty()}
     * when the token is unknown, expired, or never registered.
     */
    public Optional<User> resolve(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        Long userId = tokens.get(token);
        if (userId == null) return Optional.empty();
        return userRepository.findById(userId);
    }

    /**
     * Convenience accessor for the filter / interceptor layer that just
     * needs the numeric id.
     */
    public Long userIdOf(String token) {
        if (token == null) return null;
        return tokens.get(token);
    }

    /**
     * Convenience accessor for the filter / interceptor layer that just
     * needs the role.
     */
    public Role roleOf(String token) {
        return resolve(token).map(User::getRole).orElse(null);
    }
}
