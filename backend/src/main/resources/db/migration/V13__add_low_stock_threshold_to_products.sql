-- =============================================================================
-- V13 — Add `low_stock_threshold` to `products` (FR-05).
-- =============================================================================
-- FR-05 (Gas Inventory & Stock Management) requires a per-product
-- threshold so the backend can fire a low-stock / out-of-stock
-- notification to the seller the moment stock crosses it — independent
-- of any frontend constant.
--
-- The column is additive (no existing column, constraint, or index is
-- touched) and safe for backfill: existing rows get the seed default of
-- `5`, which mirrors the smallholder seller's restock cadence implied by
-- the seeded 6kg/13kg/22kg products in V3.
--
-- Constraint: threshold >= 0 so the seller can't accidentally configure
-- a negative alert that would fire on every sale.
-- =============================================================================

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS low_stock_threshold INT
        NOT NULL DEFAULT 5
        CHECK (low_stock_threshold >= 0);

CREATE INDEX IF NOT EXISTS idx_products_low_stock
    ON products(seller_id, low_stock_threshold)
    WHERE active = TRUE;
