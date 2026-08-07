-- =============================================================================
-- V11 — Create the `customer_profiles` table for the Customer Location module.
-- =============================================================================
-- 1:1 extension of `users` for customer-role rows, following exactly the same
-- shape as `seller_profiles` (V3) and `rider_profiles` (V3 + V6): the identity
-- columns (full name, phone, email, role) stay on `users`; only the
-- role-specific fields live here.
--
-- Why this table exists
-- ---------------------
-- The Customer Profile screen has always had a "Location Information" card
-- (Region / District / Ward / Street / Full Address), but there was nowhere to
-- persist it: `users` has no location columns and no customer-side profile
-- table existed. Saving therefore round-tripped to an endpoint that was never
-- mapped, and the values were lost on every reload.
--
-- The saved row is the *official* customer location. It feeds:
--   * the customer Profile screen (auto-loaded after login),
--   * the "Nearby Sellers" pipeline (`GET /api/sellers?lat&lng&radiusKm`,
--     which Haversine-sorts approved sellers against these coordinates).
--
-- `lat` / `lng` are always populated on write — CustomerProfileService
-- geocodes the address through the existing GeocodingService whenever the
-- client doesn't supply explicit coordinates. Storing them nullable keeps the
-- DDL honest (a row could exist before geocoding lands) without weakening the
-- service-level guarantee.
--
-- This migration is purely additive: no existing table, column, constraint or
-- relationship is altered, so no other module (Seller, Rider, Supplier, Admin)
-- is affected.
-- =============================================================================

CREATE TABLE IF NOT EXISTS customer_profiles (
    user_id    BIGINT       PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    region     VARCHAR(120),
    district   VARCHAR(120),
    ward       VARCHAR(120),
    street     VARCHAR(160),
    address    VARCHAR(500),
    lat        DOUBLE PRECISION,
    lng        DOUBLE PRECISION,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Supports the radius pre-filter if the nearby query is ever pushed into SQL.
-- Harmless today (the Haversine sort runs in Java over the approved-seller
-- set), but it costs nothing and keeps a coordinate lookup cheap.
CREATE INDEX IF NOT EXISTS idx_customer_profiles_lat_lng
    ON customer_profiles (lat, lng);
