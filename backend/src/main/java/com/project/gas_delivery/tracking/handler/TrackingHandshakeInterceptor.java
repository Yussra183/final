package com.project.gas_delivery.tracking.handler;

import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.service.SessionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.net.URI;
import java.util.Map;

/**
 * Authenticates a tracking WebSocket handshake by reading the same
 * {@code Authorization: Bearer <token>} header that
 * {@code AuthFilter} uses for REST endpoints.
 *
 * <p>The interceptor returns {@code false} (and writes a 401 directly to
 * the response) when the token is missing, malformed, or unknown. This
 * means an unauthorised client never gets a socket upgrade — they get
 * the same 401 they'd get from a REST call, with the same error envelope
 * shape so the React Native client can reuse its
 * {@link com.project.gas_delivery.auth.exception.ApiErrorBody}
 * parser.</p>
 *
 * <p>On success the actor's {@code id} and {@code role} are stashed on
 * the session attributes map (under the keys exposed by
 * {@link TrackingSessionRegistry}) so the handler never has to decode
 * the bearer token again.</p>
 */
@Component
public class TrackingHandshakeInterceptor implements HandshakeInterceptor {

    private static final Logger log = LoggerFactory.getLogger(TrackingHandshakeInterceptor.class);

    private final SessionService sessionService;

    public TrackingHandshakeInterceptor(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @Override
    public boolean beforeHandshake(
            @NonNull ServerHttpRequest request,
            @NonNull ServerHttpResponse response,
            @NonNull WebSocketHandler wsHandler,
            @NonNull Map<String, Object> attributes
    ) {
        // The browser/RN `WebSocket` constructor can't carry custom
        // HTTP headers, so native clients pass the bearer token on the
        // query string. Prefer the header when present (server-to-server
        // or extension clients that can set headers) and fall back to
        // the query param otherwise.
        String token = readBearer(request);
        if (token == null) {
            token = readQueryToken(request.getURI());
        }
        if (token == null) {
            log.debug("Tracking handshake rejected: missing/invalid Authorization header");
            return reject(response, "Missing or invalid Authorization header.");
        }
        Long userId = sessionService.userIdOf(token);
        if (userId == null) {
            log.debug("Tracking handshake rejected: unknown token");
            return reject(response, "Missing or invalid Authorization header.");
        }
        Role role = sessionService.roleOf(token);
        attributes.put(TrackingSessionRegistry.ATTR_ACTOR_ID, userId);
        attributes.put(TrackingSessionRegistry.ATTR_ACTOR_ROLE, role);
        return true;
    }

    private static String readBearer(ServerHttpRequest request) {
        String header = request.getHeaders().getFirst("Authorization");
        if (header == null || !header.startsWith("Bearer ")) return null;
        String t = header.substring("Bearer ".length()).trim();
        return t.isEmpty() ? null : t;
    }

    /**
     * Read the token from the {@code token} query param. Defensive parse
     * — returns {@code null} if the URI is malformed or the param is
     * missing/blank.
     */
    private static String readQueryToken(URI uri) {
        if (uri == null || uri.getRawQuery() == null) return null;
        for (String pair : uri.getRawQuery().split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            String key = pair.substring(0, eq);
            if (!"token".equals(key)) continue;
            String value = pair.substring(eq + 1);
            try {
                String decoded = java.net.URLDecoder.decode(value, "UTF-8");
                return decoded.isBlank() ? null : decoded;
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }

    @Override
    public void afterHandshake(
            @NonNull ServerHttpRequest request,
            @NonNull ServerHttpResponse response,
            @NonNull WebSocketHandler wsHandler,
            @NonNull Exception exception
    ) {
        // no-op — registration happens in the handler's afterConnectionEstablished
    }

    private boolean reject(ServerHttpResponse response, String message) {
        if (response instanceof ServletServerHttpResponse servlet) {
            try {
                servlet.getServletResponse()
                        .sendError(HttpStatus.UNAUTHORIZED.value(), message);
            } catch (Exception ignored) {
                // best-effort; the socket upgrade will fail anyway
            }
        }
        return false;
    }
}