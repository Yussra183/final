package com.project.gas_delivery.auth.security;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.service.SessionService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Resolves the {@code Authorization: Bearer <token>} header to a user
 * and attaches the actor's id + role as request attributes that controllers
 * can read via {@link #currentActorId(HttpServletRequest)} and
 * {@link #currentActorRole(HttpServletRequest)}.
 *
 * <p>Public endpoints (auth + CORS preflight) bypass the lookup. Unknown
 * tokens pass through with no attributes set — controllers that need an
 * actor should reject the request when {@link #currentActorId} returns
 * null.</p>
 *
 * <p>This is a stand-in for the real JWT filter. When JWT lands, swap the
 * body of {@link #resolveAndAttach} for a signed-claims parser; the
 * attribute contract stays the same.</p>
 */
@Component
public class AuthFilter extends OncePerRequestFilter {

    /** Request attribute name for the authenticated user's numeric id. */
    public static final String ATTR_ACTOR_ID = "actorId";
    /** Request attribute name for the authenticated user's role enum. */
    public static final String ATTR_ACTOR_ROLE = "actorRole";

    private final SessionService sessionService;

    public AuthFilter(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        // Public auth routes + CORS preflight don't need a token.
        return path.startsWith("/api/auth/")
                || "OPTIONS".equalsIgnoreCase(request.getMethod());
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        resolveAndAttach(request);
        filterChain.doFilter(request, response);
    }

    private void resolveAndAttach(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) return;
        String token = header.substring("Bearer ".length()).trim();
        if (token.isEmpty()) return;
        Long userId = sessionService.userIdOf(token);
        if (userId == null) return;
        Role role = sessionService.roleOf(token);
        request.setAttribute(ATTR_ACTOR_ID, userId);
        request.setAttribute(ATTR_ACTOR_ROLE, role);
    }

    /**
     * Read the actor id from the request attributes. Returns {@code null}
     * if the request did not carry a recognised bearer token.
     */
    public static Long currentActorId(HttpServletRequest request) {
        Object value = request.getAttribute(ATTR_ACTOR_ID);
        return value instanceof Long ? (Long) value : null;
    }

    /**
     * Read the actor role from the request attributes. Returns {@code null}
     * if the request did not carry a recognised bearer token.
     */
    public static Role currentActorRole(HttpServletRequest request) {
        Object value = request.getAttribute(ATTR_ACTOR_ROLE);
        return value instanceof Role ? (Role) value : null;
    }
}
