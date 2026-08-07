-- =============================================================================
-- V6 — Rider Profile: extra fields required by the Rider Profile module.
-- =============================================================================
-- The Rider Profile screen surfaces four new rider-level fields that the
-- V3 rider_profiles table didn't carry:
--
--   region      VARCHAR(120)  — administrative region (e.g. Dar es Salaam)
--   district    VARCHAR(120)  — district / ward within the region
--   address     VARCHAR(500)  — full physical address line
--   national_id VARCHAR(60)   — government-issued national ID number
--
-- All columns are nullable so existing seeded riders (V3) and any row
-- already in production keep loading without a backfill. The new fields
-- are purely additive — no existing column is renamed, dropped, or has
-- its type changed, and no other module reads or writes them.
--
-- The columns are not surfaced in the dispatch queue or seller-side
-- filters; they only feed the rider self-service profile screen.
-- =============================================================================

ALTER TABLE rider_profiles
    ADD COLUMN IF NOT EXISTS region      VARCHAR(120),
    ADD COLUMN IF NOT EXISTS district    VARCHAR(120),
    ADD COLUMN IF NOT EXISTS address     VARCHAR(500),
    ADD COLUMN IF NOT EXISTS national_id VARCHAR(60);