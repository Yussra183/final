-- =============================================================================
-- V12 — Persist Ward and Street on `seller_profiles`.
-- =============================================================================
-- The seller Shop Profile screen has always carried Region / District / Ward /
-- Street / Full Business Address fields, but `seller_profiles` (V3) only
-- stored Region, District and a single free-form `address` blob. Ward and
-- Street had no column, so the frontend's typed values were silently dropped
-- by Jackson on the way in and never returned — the saved-then-restarted
-- app rendered Ward + Street empty even though the seller had typed them
-- at registration.
--
-- Mirrors V11's customer_profiles layout (ward VARCHAR(120), street
-- VARCHAR(160)). Additive only — no existing column, constraint or index is
-- altered, so Seller / Rider / Supplier / Admin modules are unaffected.
--
-- V3 seed sellers (the only rows that exist pre-V12) are not backfilled: their
-- Ward / Street are null and the seller portal Edit modal will repopulate
-- them the next time the seller saves. This matches the customer_profiles
-- rollout, which also did not backfill.
-- =============================================================================

ALTER TABLE seller_profiles
    ADD COLUMN IF NOT EXISTS ward   VARCHAR(120),
    ADD COLUMN IF NOT EXISTS street VARCHAR(160);