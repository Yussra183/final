package com.project.gas_delivery.auth.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.List;
import java.util.Map;

/**
 * Centralises HTTP error responses for every controller in the app.
 *
 * Every handler returns a JSON body shaped like:
 * <pre>
 * {
 *   "timestamp": "2026-07-17T12:00:00Z",
 *   "status":    400,
 *   "error":     "Bad Request",
 *   "message":   "...",
 *   "code":      "BAD_REQUEST",
 *   "details":   [ ... optional ... ]
 * }
 * </pre>
 *
 * The {@code message} + {@code code} fields are consumed by the frontend's
 * {@code ApiClient} (see {@code src/api/client.ts}); the {@code details}
 * array is optional and currently only emitted for bean-validation
 * failures.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(ResourceNotFoundException ex) {
        return ApiErrorBody.of(HttpStatus.NOT_FOUND, ex.getMessage(), "NOT_FOUND", null);
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<Map<String, Object>> handleBadRequest(BadRequestException ex) {
        return ApiErrorBody.of(HttpStatus.BAD_REQUEST, ex.getMessage(), "BAD_REQUEST", null);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        List<String> details = ex.getBindingResult().getFieldErrors().stream()
                .map(this::formatFieldError)
                .toList();
        return ApiErrorBody.of(HttpStatus.BAD_REQUEST, "Validation failed", "VALIDATION_FAILED", details);
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<Map<String, Object>> handleBadCredentials(BadCredentialsException ex) {
        return ApiErrorBody.of(HttpStatus.UNAUTHORIZED, "Invalid email or password", "BAD_CREDENTIALS", null);
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Map<String, Object>> handleAuth(AuthenticationException ex) {
        return ApiErrorBody.of(HttpStatus.UNAUTHORIZED, "Authentication failed", "UNAUTHORIZED", null);
    }

    /**
     * Order Flow: a customer/seller/rider attempted to act on an order
     * they don't own. 403 with {@code code=NOT_AUTHORIZED}.
     */
    @ExceptionHandler(com.project.gas_delivery.order.exception.NotAuthorizedException.class)
    public ResponseEntity<Map<String, Object>> handleNotAuthorized(
            com.project.gas_delivery.order.exception.NotAuthorizedException ex
    ) {
        return ApiErrorBody.of(HttpStatus.FORBIDDEN, ex.getMessage(), "NOT_AUTHORIZED", null);
    }

    /**
     * Order Flow: order id missing. 404 with {@code code=NOT_FOUND}.
     */
    @ExceptionHandler(com.project.gas_delivery.order.exception.OrderNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleOrderNotFound(
            com.project.gas_delivery.order.exception.OrderNotFoundException ex
    ) {
        return ApiErrorBody.of(HttpStatus.NOT_FOUND, ex.getMessage(), "NOT_FOUND", null);
    }

    /**
     * Order Flow: state machine rejected the transition
     * (e.g. trying to skip ASSIGNED → DELIVERED). 409 with
     * {@code code=INVALID_TRANSITION}.
     */
    @ExceptionHandler(com.project.gas_delivery.order.exception.InvalidTransitionException.class)
    public ResponseEntity<Map<String, Object>> handleInvalidTransition(
            com.project.gas_delivery.order.exception.InvalidTransitionException ex
    ) {
        return ApiErrorBody.of(HttpStatus.CONFLICT, ex.getMessage(), "INVALID_TRANSITION", null);
    }

    /**
     * Order Flow: another rider claimed the order first. 409 with
     * {@code code=RIDER_BUSY}.
     */
    @ExceptionHandler(com.project.gas_delivery.order.exception.RiderBusyException.class)
    public ResponseEntity<Map<String, Object>> handleRiderBusy(
            com.project.gas_delivery.order.exception.RiderBusyException ex
    ) {
        return ApiErrorBody.of(HttpStatus.CONFLICT, ex.getMessage(), "RIDER_BUSY", null);
    }

    /**
     * Tracking module: an actor attempted to read or write a tracking
     * channel they are not authorised for. 403 with
     * {@code code=TRACKING_FORBIDDEN}.
     */
    @ExceptionHandler(com.project.gas_delivery.tracking.exception.TrackingForbiddenException.class)
    public ResponseEntity<Map<String, Object>> handleTrackingForbidden(
            com.project.gas_delivery.tracking.exception.TrackingForbiddenException ex
    ) {
        return ApiErrorBody.of(HttpStatus.FORBIDDEN, ex.getMessage(), "TRACKING_FORBIDDEN", null);
    }

    /**
     * Tracking module: an order id embedded in a tracking frame did not
     * resolve. 404 with {@code code=TRACKING_ORDER_NOT_FOUND}.
     */
    @ExceptionHandler(com.project.gas_delivery.tracking.exception.TrackingOrderNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleTrackingNotFound(
            com.project.gas_delivery.tracking.exception.TrackingOrderNotFoundException ex
    ) {
        return ApiErrorBody.of(HttpStatus.NOT_FOUND, ex.getMessage(), "TRACKING_ORDER_NOT_FOUND", null);
    }

    /**
     * Permit module: a permit or document lookup did not resolve. 404 with
     * {@code code=PERMIT_NOT_FOUND}.
     */
    @ExceptionHandler(com.project.gas_delivery.permit.exception.PermitNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handlePermitNotFound(
            com.project.gas_delivery.permit.exception.PermitNotFoundException ex
    ) {
        return ApiErrorBody.of(HttpStatus.NOT_FOUND, ex.getMessage(), "PERMIT_NOT_FOUND", null);
    }

    /**
     * Permit module: the workflow rejected the transition
     * (duplicate submission, missing documents, attempting to lock an
     * approved permit, etc). 409 with {@code code=PERMIT_STATE}.
     */
    @ExceptionHandler(com.project.gas_delivery.permit.exception.PermitStateException.class)
    public ResponseEntity<Map<String, Object>> handlePermitState(
            com.project.gas_delivery.permit.exception.PermitStateException ex
    ) {
        return ApiErrorBody.of(HttpStatus.CONFLICT, ex.getMessage(), "PERMIT_STATE", null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
        return ApiErrorBody.of(HttpStatus.INTERNAL_SERVER_ERROR,
                "An unexpected error occurred", "INTERNAL_ERROR", null);
    }

    // --- helpers ---

    private String formatFieldError(FieldError fe) {
        return fe.getField() + ": " + fe.getDefaultMessage();
    }
}
