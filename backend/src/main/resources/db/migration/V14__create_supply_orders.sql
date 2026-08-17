-- =============================================================================
-- V14 — Supply Orders (FR-06: Gas Supply Management).
-- =============================================================================
-- A seller raises a supply order to a supplier when their stock runs low;
-- the supplier accepts / rejects / prepares / dispatches / delivers, and the
-- seller confirms receipt so the seller's `products.stock` is replenished.
--
-- The state machine is:
--   PENDING  → ACCEPTED   (supplier)
--   PENDING  → REJECTED   (supplier, with reason)
--   ACCEPTED → PREPARING  (supplier)
--   ACCEPTED → DISPATCHED (supplier)
--   PREPARING → DISPATCHED (supplier)
--   DISPATCHED → DELIVERED (supplier — marks the load as delivered to the
--                             seller's door)
--   DELIVERED → RECEIVED   (seller — confirms the cylinders, which adds
--                             `quantity` back to the matching `products.stock`
--                             and is terminal)
--
-- Anything in {PENDING, ACCEPTED, PREPARING, DISPATCHED} can be cancelled
-- by either party (seller cancel before supplier accepts; supplier cancel
-- before dispatch). DELIVERED → seller still has 7 days to RECEIVE; after
-- that the row stays in DELIVERED but is no longer cancellable.
--
-- `product_name` / `size` / `quantity` are denormalised snapshots so the
-- supplier sees exactly what the seller ordered even if the seller's
-- catalogue has since changed. `product_id` is an optional back-reference
-- to a row in `products` (sellers sometimes order a generic
-- "LPG 13kg refill" the supplier can fulfil from any of their own
-- brands — in that case `product_id` is null and replenishment skips the
-- stock update on receipt).
-- =============================================================================

CREATE TABLE IF NOT EXISTS supply_orders (
    id                  BIGSERIAL    PRIMARY KEY,
    seller_id           BIGINT       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    seller_name         VARCHAR(120) NOT NULL,
    supplier_id         BIGINT       REFERENCES users(id) ON DELETE RESTRICT,
    supplier_name       VARCHAR(120),
    product_name        VARCHAR(160) NOT NULL,
    size                VARCHAR(40)  NOT NULL,
    quantity            INT          NOT NULL CHECK (quantity > 0),
    product_id          BIGINT       REFERENCES products(id) ON DELETE SET NULL,
    notes               VARCHAR(1000),
    status              VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    reject_reason       VARCHAR(500),
    dispatched_at       TIMESTAMP,
    delivered_at        TIMESTAMP,
    received_at         TIMESTAMP,
    cancelled_at        TIMESTAMP,
    cancelled_by_role   VARCHAR(20),
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_supply_orders_status
        CHECK (status IN ('PENDING', 'ACCEPTED', 'PREPARING', 'DISPATCHED',
                          'DELIVERED', 'RECEIVED', 'REJECTED', 'CANCELLED')),
    CONSTRAINT chk_supply_orders_cancelled_by
        CHECK (cancelled_by_role IS NULL OR cancelled_by_role IN ('SELLER', 'SUPPLIER'))
);

-- Dominant filters: per-supplier queue, per-seller history, supplier-scoped
-- "available" queue mirrors the order dispatch filter.
CREATE INDEX IF NOT EXISTS idx_supply_orders_supplier_pending
    ON supply_orders(supplier_id, updated_at DESC)
    WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_supply_orders_supplier
    ON supply_orders(supplier_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_supply_orders_seller
    ON supply_orders(seller_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_supply_orders_status_updated
    ON supply_orders(status, updated_at DESC);

-- updated_at trigger — mirrors V3 / V2 patterns.
CREATE OR REPLACE FUNCTION supply_orders_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_supply_orders_set_updated_at
    BEFORE UPDATE ON supply_orders
    FOR EACH ROW
    EXECUTE FUNCTION supply_orders_set_updated_at();
