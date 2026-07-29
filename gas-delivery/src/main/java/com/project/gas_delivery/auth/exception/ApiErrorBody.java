package com.project.gas_delivery.auth.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Shared error-response builder for the global exception handler.
 *
 * Produces the JSON envelope the frontend {@code ApiClient} already parses:
 * <pre>
 * {
 *   "timestamp": "2026-07-17T12:00:00Z",
 *   "status":    409,
 *   "error":     "Conflict",
 *   "message":   "...",
 *   "code":      "RIDER_BUSY",
 *   "details":   [ ... ]
 * }
 * </pre>
 *
 * Extracted from {@link GlobalExceptionHandler} so future modules
 * (Order, Product, Restock, …) can emit identically shaped responses
 * without duplicating the envelope logic.
 */
public final class ApiErrorBody {

    private ApiErrorBody() {
    }

    /**
     * Build an error response with an optional stable code (e.g. {@code "RIDER_BUSY"})
     * and an optional list of field-level details.
     */
    public static ResponseEntity<Map<String, Object>> of(
            HttpStatus status,
            String message,
            String code,
            List<String> details
    ) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", status.value());
        body.put("error", status.getReasonPhrase());
        body.put("message", message);
        if (code != null && !code.isBlank()) {
            body.put("code", code);
        }
        if (details != null && !details.isEmpty()) {
            body.put("details", details);
        }
        return ResponseEntity.status(status).body(body);
    }
}
