package com.project.gas_delivery.tracking.config;

import com.project.gas_delivery.tracking.handler.TrackingHandshakeInterceptor;
import com.project.gas_delivery.tracking.handler.TrackingWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * Registers the tracking WebSocket endpoint at {@code /ws/tracking}.
 *
 * <p>Authentication happens in
 * {@link TrackingHandshakeInterceptor} (same {@code Bearer} token as the
 * REST endpoints) so {@link TrackingWebSocketHandler} can assume every
 * connected client carries a valid identity.</p>
 *
 * <p>The endpoint accepts every origin because authentication is enforced
 * at the handshake. CORS for REST remains the responsibility of
 * {@code CorsConfig}.</p>
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final TrackingWebSocketHandler handler;
    private final TrackingHandshakeInterceptor handshakeInterceptor;

    public WebSocketConfig(
            TrackingWebSocketHandler handler,
            TrackingHandshakeInterceptor handshakeInterceptor
    ) {
        this.handler = handler;
        this.handshakeInterceptor = handshakeInterceptor;
    }

    @Override
    public void registerWebSocketHandlers(@NonNull WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/tracking")
                .addInterceptors(handshakeInterceptor)
                .setAllowedOriginPatterns("*");
    }
}