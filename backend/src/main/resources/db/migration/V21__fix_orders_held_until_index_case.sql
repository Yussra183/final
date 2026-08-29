-- =============================================================================
-- V21 — Correct the `idx_orders_held_until` partial-index predicate.
-- =============================================================================
-- V20 created the index with lowercase status literals:
--
--     WHERE status IN ('assigned', 'pickup_pending')
--
-- but `OrderEntity.status` is mapped with `@Enumerated(EnumType.STRING)`,
-- so the column actually stores the *uppercase enum name* — 'ASSIGNED'
-- and 'PICKUP_CONFIRMATION_PENDING'. ('pickup_pending' is the JSON wire
-- form, which never reaches the database at all.)
--
-- The consequence was silent: the predicate matched zero rows, so the
-- index was empty and the expiration sweep in PickupHoldExpirationTask
-- fell back to a sequential scan of `orders` every 30 seconds. Correct
-- results, quietly degrading cost as the table grows.
--
-- Rebuilt here with the values the column really holds.
-- =============================================================================

DROP INDEX IF EXISTS idx_orders_held_until;

CREATE INDEX IF NOT EXISTS idx_orders_held_until
    ON orders (held_until)
    WHERE status IN ('ASSIGNED', 'PICKUP_CONFIRMATION_PENDING');
