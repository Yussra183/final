-- =============================================================================
-- V18 — Supplier delivery operations: persisted trips + stop snapshots.
-- =============================================================================
-- V10 gave the supplier `delivery_routes` / `delivery_route_stops` (the
-- recurring *plan*) but nothing to represent an actual *run* of that plan.
-- "Start Delivery" therefore lived only in React state, so an operation
-- vanished on reload and no seller on another device could ever observe
-- it. Two new tables close that gap:
--
--   delivery_trips      — one execution of a route on a given day, with
--                         its rider, vehicle, supervisor and lifecycle
--                         status (PLANNED → READY → ACTIVE → COMPLETED).
--   delivery_trip_stops — the route's stops *snapshotted* at start time.
--
-- Why snapshot the stops instead of joining `delivery_route_stops`?
-- Because the supplier may edit the route (add/remove/reorder sellers)
-- while a delivery is already on the road. A running operation must keep
-- serving the sellers it departed with, so the trip owns its own copy.
--
-- Hard rules (matching V10's conventions):
--   1. NO existing schema is touched. V1..V17 stay byte-identical.
--   2. FKs reference existing tables; ON DELETE SET NULL where the trip
--      should survive the referenced row disappearing (rider, vehicle),
--      CASCADE where it should not (supplier, route).
--   3. No seeding of demo data — the supplier creates their own.
-- =============================================================================

CREATE TABLE IF NOT EXISTS delivery_trips (
    id               BIGSERIAL    PRIMARY KEY,
    supplier_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    route_id         BIGINT       NOT NULL REFERENCES delivery_routes(id) ON DELETE CASCADE,
    -- Denormalised so a completed trip still reads correctly in history
    -- even after the route is renamed or rescheduled.
    route_name       VARCHAR(120) NOT NULL,
    schedule_day     VARCHAR(3)   NOT NULL,
    -- Rider/vehicle are optional at creation: the supplier may plan the
    -- operation before the crew is settled. ON DELETE SET NULL keeps the
    -- historical trip readable via the denormalised name/plate.
    rider_id         BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    rider_name       VARCHAR(120),
    vehicle_id       BIGINT       REFERENCES supplier_vehicles(id) ON DELETE SET NULL,
    vehicle_plate    VARCHAR(40),
    -- Supervisor is deliberately free text, not a FK: there is no
    -- supervisor role in this system and the person supervising a run is
    -- simply "someone at the supply company". Storing name + phone keeps
    -- the feature working without inventing a role or a permission.
    supervisor_name  VARCHAR(120),
    supervisor_phone VARCHAR(30),
    status           VARCHAR(16)  NOT NULL DEFAULT 'PLANNED',
    started_at       TIMESTAMP,
    completed_at     TIMESTAMP,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_delivery_trips_supplier
    ON delivery_trips (supplier_id);
CREATE INDEX IF NOT EXISTS idx_delivery_trips_route
    ON delivery_trips (route_id);
CREATE INDEX IF NOT EXISTS idx_delivery_trips_status
    ON delivery_trips (status);

-- At most one ACTIVE operation per route. A partial unique index is the
-- cheapest way to make "you already have a delivery running on this
-- route" a database invariant rather than a service-layer race.
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_trips_one_active_per_route
    ON delivery_trips (route_id)
    WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS delivery_trip_stops (
    id           BIGSERIAL        PRIMARY KEY,
    trip_id      BIGINT           NOT NULL REFERENCES delivery_trips(id) ON DELETE CASCADE,
    sequence     INTEGER          NOT NULL,
    seller_id    BIGINT           REFERENCES users(id) ON DELETE SET NULL,
    seller_name  VARCHAR(120)     NOT NULL,
    address      VARCHAR(255)     NOT NULL,
    lat          DOUBLE PRECISION NOT NULL,
    lng          DOUBLE PRECISION NOT NULL,
    -- Mirrors the frontend's `StopStatus` union. Stops start as
    -- 'started' the moment the trip goes ACTIVE and end as 'delivered'.
    status       VARCHAR(16)      NOT NULL DEFAULT 'scheduled',
    delivered_at TIMESTAMP,
    UNIQUE (trip_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_delivery_trip_stops_trip
    ON delivery_trip_stops (trip_id);
-- The seller-side tracking authorisation asks "is this seller a stop on
-- this ACTIVE trip?" on every subscribe, so index the lookup column.
CREATE INDEX IF NOT EXISTS idx_delivery_trip_stops_seller
    ON delivery_trip_stops (seller_id);
