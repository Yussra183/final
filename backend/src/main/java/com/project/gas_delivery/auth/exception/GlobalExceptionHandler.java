package com.project.gas_delivery.auth.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

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

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

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

    /**
     * Seller-specific: the account is correct but the permit is still
     * awaiting admin review (status PENDING or UNDER_REVIEW). Surfaced
     * with HTTP 403 and a dedicated code so the frontend can render a
     * "waiting for admin approval" message instead of the generic
     * wrong-password alert. Placed before the AuthenticationException
     * handler below so Spring picks the more specific exception type.
     */
    @ExceptionHandler(AccountPendingApprovalException.class)
    public ResponseEntity<Map<String, Object>> handleAccountPendingApproval(AccountPendingApprovalException ex) {
        java.util.List<String> details = ex.getStatus() == null
                ? null
                : java.util.List.of("status:" + ex.getStatus());
        return ApiErrorBody.of(
                HttpStatus.FORBIDDEN,
                "Your account is waiting for admin approval.",
                "ACCOUNT_PENDING_APPROVAL",
                details
        );
    }

    /**
     * Seller-specific: the permit application was rejected by an admin.
     * The seller can re-upload documents and submit a new application.
     * HTTP 403 with the rejection reason in the message and details.
     */
    @ExceptionHandler(AccountRejectedException.class)
    public ResponseEntity<Map<String, Object>> handleAccountRejected(AccountRejectedException ex) {
        java.util.List<String> details = ex.getRejectionReason() == null
                ? null
                : java.util.List.of("reason:" + ex.getRejectionReason());
        return ApiErrorBody.of(
                HttpStatus.FORBIDDEN,
                ex.getMessage(),
                "ACCOUNT_REJECTED",
                details
        );
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
     * Order Flow (FR-05): a customer requested more units of a product
     * than the seller has on hand. 409 with
     * {@code code=INSUFFICIENT_STOCK}; the {@code details} array carries
     * {@code productId}, {@code productName}, {@code available} and
     * {@code requested} so the customer UI can render "Only X left".
     */
    @ExceptionHandler(com.project.gas_delivery.order.exception.InsufficientStockException.class)
    public ResponseEntity<Map<String, Object>> handleInsufficientStock(
            com.project.gas_delivery.order.exception.InsufficientStockException ex
    ) {
        java.util.List<String> details = java.util.List.of(
                "productId:" + ex.getProductId(),
                "productName:" + ex.getProductName(),
                "available:" + ex.getAvailable(),
                "requested:" + ex.getRequested()
        );
        return ApiErrorBody.of(
                HttpStatus.CONFLICT,
                ex.getMessage(),
                "INSUFFICIENT_STOCK",
                details
        );
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

    /**
     * FR-06 supply-order module: maps {@link com.project.gas_delivery.supply.exception.SupplyOrderException}
     * to a stable HTTP status + {@code code} combo so the frontend can
     * switch on the {@code code} field without parsing messages.
     *
     * <ul>
     *   <li>{@code NOT_FOUND} → 404 / {@code SUPPLY_NOT_FOUND}</li>
     *   <li>{@code FORBIDDEN} → 403 / {@code SUPPLY_FORBIDDEN}</li>
     *   <li>{@code ILLEGAL_TRANSITION} → 409 / {@code SUPPLY_ILLEGAL_TRANSITION}</li>
     *   <li>{@code REASON_REQUIRED} → 400 / {@code SUPPLY_REASON_REQUIRED}</li>
     *   <li>{@code SUPPLIER_NOT_APPROVED} → 403 / {@code SUPPLY_SUPPLIER_NOT_APPROVED}</li>
     *   <li>{@code SELF_REQUEST} → 400 / {@code SUPPLY_SELF_REQUEST}</li>
     * </ul>
     */
    @ExceptionHandler(com.project.gas_delivery.supply.exception.SupplyOrderException.class)
    public ResponseEntity<Map<String, Object>> handleSupplyOrder(
            com.project.gas_delivery.supply.exception.SupplyOrderException ex
    ) {
        com.project.gas_delivery.supply.exception.SupplyOrderException.Kind kind = ex.getKind();
        return switch (kind) {
            case NOT_FOUND            -> ApiErrorBody.of(HttpStatus.NOT_FOUND,
                    ex.getMessage(), "SUPPLY_NOT_FOUND", null);
            case FORBIDDEN            -> ApiErrorBody.of(HttpStatus.FORBIDDEN,
                    ex.getMessage(), "SUPPLY_FORBIDDEN", null);
            case ILLEGAL_TRANSITION   -> ApiErrorBody.of(HttpStatus.CONFLICT,
                    ex.getMessage(), "SUPPLY_ILLEGAL_TRANSITION", null);
            case REASON_REQUIRED      -> ApiErrorBody.of(HttpStatus.BAD_REQUEST,
                    ex.getMessage(), "SUPPLY_REASON_REQUIRED", null);
            case SUPPLIER_NOT_APPROVED -> ApiErrorBody.of(HttpStatus.FORBIDDEN,
                    ex.getMessage(), "SUPPLY_SUPPLIER_NOT_APPROVED", null);
            case SELF_REQUEST         -> ApiErrorBody.of(HttpStatus.BAD_REQUEST,
                    ex.getMessage(), "SUPPLY_SELF_REQUEST", null);
        };
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
        return ApiErrorBody.of(HttpStatus.INTERNAL_SERVER_ERROR,
                "An unexpected error occurred", "INTERNAL_ERROR", null);
    }

    /**
     * The frontend's bulk {@code /api/...} refresh calls several endpoints
     * the backend does not yet expose (e.g. {@code /api/users},
     * {@code /api/restock}, {@code /api/complaints}). Spring's static
     * resource handler raises a {@link NoResourceFoundException} for
     * those paths; without a dedicated handler the catch-all above
     * converts them to HTTP 500, which makes the store surface
     * "Couldn't refresh data" after a successful login.
     *
     * <p>Map this exception to a proper 404 with a stable
     * {@code NOT_FOUND} code so the frontend's {@code Promise.allSettled}
     * treats it as an empty list rather than a server crash. The
     * underlying stack trace is still logged at WARN level for ops to
     * see which endpoint is being requested.</p>
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNoResource(NoResourceFoundException ex) {
        log.warn("No handler found for request path: {}", ex.getResourcePath());
        return ApiErrorBody.of(HttpStatus.NOT_FOUND,
                "No endpoint mapped to " + ex.getResourcePath(),
                "NOT_FOUND", null);
    }

    // --- helpers ---

    private String formatFieldError(FieldError fe) {
        return fe.getField() + ": " + fe.getDefaultMessage();
    }
}
