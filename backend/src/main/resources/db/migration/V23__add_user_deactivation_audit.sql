-- =============================================================================
-- V23 — Add admin deactivation audit columns to `users`.
-- =============================================================================
-- The platform already gates public visibility and login on the
-- `users.is_active` boolean, but `is_active` is overloaded:
--
--   1. A SELLER registers with `is_active=false` and is flipped to TRUE
--      only when `PermitService.approve` runs (PermitService.java ~line 282).
--   2. The same boolean was the only lever for "an admin disabled this
--      account" before this migration.
--
-- We need to tell those two cases apart so that an admin-deactivated
-- Seller — with an APPROVED permit, paid orders, real customers —
-- cannot keep logging in and serving orders just because the role is
-- SELLER. (AuthServiceImpl.login historically exempted SELLER from the
-- `is_active` check, see lines 270-275, so the only way to lock out an
-- already-approved Seller was to leave the row dangling.)
--
-- The three columns below carry the admin deactivation record. They
-- are NULL for every user that has not been admin-deactivated, so:
--
--   * `is_active = TRUE` and `deactivated_at IS NULL`  -> normal user
--   * `is_active = FALSE` and `deactivated_at IS NULL` -> pending permit
--                                                       -> flip back to
--                                                          active on approval
--   * `deactivated_at IS NOT NULL`                     -> admin disabled
--                                                       -> locked out across
--                                                          every role
--   * `deactivated_by` records the admin user id; `deactivation_reason`
--     carries the free-text note the admin typed (max 500 chars).
--
-- `deactivated_by` references `users(id)` (the same table) without ON
-- DELETE — admins are never deleted in normal flows so the FK is
-- effectively permanent; if an admin row is ever removed we will deal
-- with it as a one-off cleanup. NO ACTION (the default) prevents
-- accidental cascade of audit history.
-- =============================================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deactivated_at    TIMESTAMP,
    ADD COLUMN IF NOT EXISTS deactivated_by    BIGINT REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS deactivation_reason VARCHAR(500);

-- Helpful partial index for "is this user locked out?" lookups in
-- AuthServiceImpl.login and the public visibility gates. Only locked
-- rows are indexed, so the index stays tiny even on large users tables.
CREATE INDEX IF NOT EXISTS idx_users_deactivated_at
    ON users (deactivated_at)
    WHERE deactivated_at IS NOT NULL;