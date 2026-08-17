-- =============================================================================
-- V15 — Payments (FR-04: Payment & Order Completion).
-- =============================================================================
-- Simulated payment flow that mirrors the diagram in the project's flow chart:
--   "Rider Arrives at Delivery Location → Make Payment to Rider → Order Completed"
--
-- Payment lifecycle (mirrors OrderStatus for the order it references):
--   PENDING   — order is placed but not delivered yet (default state).
--   COMPLETED — customer has paid (in this MVP we treat rider-driven
--               DELIVERED as the trigger, see PaymentService).
--   FAILED    — payment attempt failed (e.g. M-Pesa simulation rejected).
--   REFUNDED  — order was cancelled / rejected after payment cleared.
--
-- Each row is one payment attempt per order. We support one active payment
-- per order at a time (UNIQUE constraint on `order_id WHERE status IN
-- ('PENDING','COMPLETED')`) — a failed attempt can be retried; a refunded
-- payment closes the slot for that order.
--
-- `method` is captured so the UI can render Cash / M-Pesa / Card badges
-- even though the backend is just a simulation.
--
-- `transaction_ref` is a synthetic code (e.g. `TXN-XXXXXX`) returned to the
-- frontend to mimic what an M-Pesa / Stripe confirmation would look like.
-- =============================================================================

CREATE TABLE IF NOT EXISTS payments (
    id                BIGSERIAL      PRIMARY KEY,
    order_id          BIGINT         NOT NULL
                                       REFERENCES orders(id) ON DELETE RESTRICT,
    customer_id       BIGINT         NOT NULL
                                       REFERENCES users(id) ON DELETE RESTRICT,
    seller_id         BIGINT         NOT NULL
                                       REFERENCES users(id) ON DELETE RESTRICT,
    amount            NUMERIC(12,2)  NOT NULL CHECK (amount >= 0),
    method            VARCHAR(20)    NOT NULL DEFAULT 'CASH',
    status            VARCHAR(20)    NOT NULL DEFAULT 'PENDING',
    transaction_ref   VARCHAR(60),
    phone             VARCHAR(30),
    notes             VARCHAR(500),
    paid_at           TIMESTAMP,
    refunded_at       TIMESTAMP,
    created_at        TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_payments_method
        CHECK (method IN ('CASH', 'MPESA', 'CARD', 'BANK')),
    CONSTRAINT chk_payments_status
        CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'))
);

-- One active payment per order (PENDING or COMPLETED). A second row for
-- the same order is allowed only if the prior attempt is FAILED or
-- REFUNDED, so retries don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_active_order
    ON payments(order_id)
    WHERE status IN ('PENDING', 'COMPLETED');

-- Per-customer history (My Orders → Payments tab) and per-seller revenue
-- reconciliation both filter by these columns.
CREATE INDEX IF NOT EXISTS idx_payments_customer
    ON payments(customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_seller
    ON payments(seller_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status_updated
    ON payments(status, updated_at DESC);

-- updated_at trigger (same shape as V2 / V14).
CREATE OR REPLACE FUNCTION payments_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payments_set_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION payments_set_updated_at();
