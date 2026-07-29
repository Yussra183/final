-- =============================================================================
-- V2 — Create the `orders` table backing the Order Flow state machine.
-- =============================================================================
-- Designed to match the frontend's wire contract (see src/api/endpoints.ts).
--   • `id`            BIGSERIAL — String on the wire.
--   • `items`         JSONB     — snapshot at order creation; no relational
--                                 normalisation in MVP.
--   • `status`        VARCHAR   — lowercase wire form (pending/accepted/...),
--                                 mirrors the Role enum convention.
--   • FK to users(id) for customer / seller / rider. ON DELETE RESTRICT so
--                                 audit history stays valid.
-- =============================================================================

CREATE TABLE IF NOT EXISTS orders (
    id                       BIGSERIAL    PRIMARY KEY,
    customer_id              BIGINT       NOT NULL,
    customer_name            VARCHAR(120) NOT NULL,
    seller_id                BIGINT       NOT NULL,
    seller_name              VARCHAR(120) NOT NULL,
    rider_id                 BIGINT,
    rider_name               VARCHAR(120),
    items                    JSONB        NOT NULL,
    total                    NUMERIC(12,2) NOT NULL CHECK (total >= 0),
    status                   VARCHAR(20)  NOT NULL,
    delivery_address         VARCHAR(500) NOT NULL,
    delivery_lat             DOUBLE PRECISION,
    delivery_lng             DOUBLE PRECISION,
    phone                    VARCHAR(30),
    notes                    VARCHAR(1000),
    reject_reason            VARCHAR(500),
    created_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id)
        REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_orders_seller   FOREIGN KEY (seller_id)
        REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_orders_rider    FOREIGN KEY (rider_id)
        REFERENCES users(id) ON DELETE RESTRICT
);

-- Indexes for the list filters. customerId/sellerId/riderId are the
-- dominant filters from OrdersApi.list(...); (status, updated_at DESC)
-- supports the dispatch queue sorted newest-first.
CREATE INDEX IF NOT EXISTS idx_orders_customer        ON orders (customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_seller          ON orders (seller_id,   updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_rider           ON orders (rider_id,    updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_updated  ON orders (status,      updated_at DESC);

-- Partial index used by GET /api/orders/dispatch/available — keeps the
-- queue lookup O(returned rows) instead of scanning the whole table.
CREATE INDEX IF NOT EXISTS idx_orders_dispatch_queue
    ON orders (updated_at DESC)
    WHERE status = 'accepted' AND rider_id IS NULL;

-- Maintain updated_at on UPDATE.
CREATE OR REPLACE FUNCTION orders_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_set_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION orders_set_updated_at();
