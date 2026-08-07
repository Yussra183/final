/**
 * Typed errors thrown by the Order Flow domain layer.
 *
 * Each `code` is stable so the UI can match on it (e.g. `RIDER_BUSY` →
 * "Another rider got there first"). Subclasses are exposed only when
 * the caller needs to recover specific fields (e.g. `validationField`
 * on `ValidationError`).
 *
 * Every error inherits `Error` so async stacks still flow into the
 * store's `run()` wrapper, but the UI should read `code` not `message`.
 */

export type OrderErrorCode =
  | "INVALID_PHONE"
  | "INVALID_ADDRESS"
  | "INVALID_QUANTITY"
  | "OUT_OF_STOCK"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "NOT_AUTHORIZED"
  | "RIDER_BUSY"
  | "RIDER_OFFLINE"
  | "BROADCAST_RADIUS_TOO_FAR"
  | "SELLER_NOT_ACTIVE"
  | "MISSING_PHONE";

export class OrderServiceError extends Error {
  public readonly code: OrderErrorCode;

  constructor(code: OrderErrorCode, message: string) {
    super(message);
    this.name = "OrderServiceError";
    this.code = code;
  }
}

/**
 * Validation-specific error that carries the offending field name so
 * the UI can highlight the correct input.
 */
export class OrderValidationError extends OrderServiceError {
  public readonly field: string;

  constructor(code: OrderErrorCode, field: string, message: string) {
    super(code, message);
    this.name = "OrderValidationError";
    this.field = field;
  }
}
