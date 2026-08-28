-- =============================================================================
-- V20 — Add pickup-confirmation columns to the `orders` table.
-- =============================================================================
-- Backs the controlled Rider → Seller pickup workflow:
--   • `held_until`        — claim deadline; while `status IN ('assigned',
--                            'pickup_pending')` and `held_until < now()`,
--                            the order is reaped back to 'accepted' so
--                            other riders can pick it up.
--   • `picked_up_at`      — server-side timestamp of the physical handover.
--                            Distinct from `updated_at` (which moves on
--                            every status change).
-- Both are nullable: existing rows are untouched and existing flows that
-- never touch pickup semantics keep working.
-- =============================================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS held_until   TIMESTAMP,
    ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP;

-- Partial index speeds up the reap query in PickupHoldExpirationTask:
-- it only ever scans rows that are still in an active hold.
CREATE INDEX IF NOT EXISTS idx_orders_held_until
    ON orders (held_until)
    WHERE status IN ('assigned', 'pickup_pending');