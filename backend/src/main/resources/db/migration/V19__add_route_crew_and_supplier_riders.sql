-- =============================================================================
-- V19 — Route crew capture (supervisor + rider + vehicle) + supplier_riders.
-- =============================================================================
-- Captures the supplier's chosen Supervisor / Rider / Vehicle directly on
-- `delivery_routes` so the weekly recurrence reuses the same crew, and adds a
-- small `supplier_riders` join table that expresses "which riders belong to
-- this supplier's company" without touching the existing `seller_riders`
-- table (which is still owned by the order-dispatch path).
--
-- Hard rules (matching V10 / V18):
--   1. NO existing schema is altered to non-nullable. New columns are NULL.
--   2. FKs reference existing tables. ON DELETE SET NULL on the route's
--      references so a later vehicle/rider deactivation doesn't crash history.
--   3. `seller_riders` is untouched. No seeding of demo data.
-- =============================================================================

ALTER TABLE delivery_routes
    ADD COLUMN IF NOT EXISTS rider_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS vehicle_id       BIGINT REFERENCES supplier_vehicles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS supervisor_name  VARCHAR(120),
    ADD COLUMN IF NOT EXISTS supervisor_phone VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_delivery_routes_rider
    ON delivery_routes (rider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_routes_vehicle
    ON delivery_routes (vehicle_id);

-- Supplier ↔ rider assignments. Composite PK mirrors `seller_riders` exactly
-- (V3) so the two joins are structurally identical and easy to reason about.
CREATE TABLE IF NOT EXISTS supplier_riders (
    supplier_id  BIGINT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rider_id     BIGINT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (supplier_id, rider_id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_riders_rider
    ON supplier_riders (rider_id);
