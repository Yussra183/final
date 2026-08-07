-- =============================================================================
-- V10 — Supplier logistics: delivery routes, route stops, supplier vehicles.
-- =============================================================================
-- The supplier module's "Start Delivery" form picks a route, a vehicle,
-- and a rider. Routes and stops were never persisted server-side
-- (V3 only seeded rider_profiles, not delivery infrastructure), and
-- vehicles were never modelled at all — they lived on the rider profile
-- as a string. To make the Live Delivery form functional end-to-end
-- with real data, we add three new tables:
--
--   delivery_routes      — recurring route definition owned by a supplier
--   delivery_route_stops — ordered seller stops along the route polyline
--   supplier_vehicles    — the supplier's distribution fleet
--
-- Hard rules (matching the user's spec):
--   1. NO existing schema is touched. V1..V9 are byte-identical.
--   2. FKs reference `users(id)` with ON DELETE CASCADE so removing a
--      supplier / vehicle cascades cleanly. No ALTER on existing FKs.
--   3. No seeding of demo data — the supplier module exposes CRUD via
--      /api/routes and /api/vehicles so the supplier adds their own.
--      The frontend surfaces the empty state until the supplier creates
--      the first route / vehicle.
-- =============================================================================

CREATE TABLE IF NOT EXISTS delivery_routes (
    id              BIGSERIAL    PRIMARY KEY,
    supplier_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(120) NOT NULL,
    schedule_day    VARCHAR(3)   NOT NULL,
    schedule_time   VARCHAR(5)   NOT NULL,
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_delivery_routes_supplier
    ON delivery_routes (supplier_id);
CREATE INDEX IF NOT EXISTS idx_delivery_routes_active
    ON delivery_routes (active);

CREATE TABLE IF NOT EXISTS delivery_route_stops (
    id              BIGSERIAL    PRIMARY KEY,
    route_id        BIGINT       NOT NULL REFERENCES delivery_routes(id) ON DELETE CASCADE,
    sequence        INTEGER      NOT NULL,
    seller_id       BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    seller_name     VARCHAR(120) NOT NULL,
    address         VARCHAR(255) NOT NULL,
    lat             DOUBLE PRECISION NOT NULL,
    lng             DOUBLE PRECISION NOT NULL,
    UNIQUE (route_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_delivery_route_stops_route
    ON delivery_route_stops (route_id);

CREATE TABLE IF NOT EXISTS supplier_vehicles (
    id              BIGSERIAL    PRIMARY KEY,
    supplier_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plate           VARCHAR(40)  NOT NULL,
    model           VARCHAR(120) NOT NULL,
    capacity_kg     INTEGER      NOT NULL,
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (supplier_id, plate)
);
CREATE INDEX IF NOT EXISTS idx_supplier_vehicles_supplier
    ON supplier_vehicles (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_vehicles_active
    ON supplier_vehicles (active);