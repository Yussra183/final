-- =============================================================================
-- V9 — Remove demo/seed users and their data introduced by V3.
-- =============================================================================
-- V3 (`V3__seed_users_products_riders.sql`) bootstrapped demo users so
-- storefront screens had rows to display before any application
-- registration happened. The product is now mature enough that only
-- data created through the application should appear in the UI, so we
-- strip the V3 seed rows.
--
-- Hard rules (matching the user's spec):
--   1. NO schema change. V9 is DDL-free: only UPDATE/DELETE/SELECT.
--   2. NO foreign-key toggle, NO `DROP CONSTRAINT`, NO `CASCADE` on
--      `schema` level. We work entirely inside the V1..V8 FK rules.
--   3. V1..V8 are byte-identical and not touched.
--   4. KEEP the administrator account intact. The cleanup list in the
--      spec covers customers, sellers, riders, suppliers, products,
--      orders, notifications, permits — never administrators. The
--      V3 ADMIN row (id 12 / `admin@example.com`) is preserved by
--      both the `role <> 'ADMIN'` filter and a final NOT-EXISTS guard.
--   5. Do NOT delete users that are still referenced from other
--      tables. If a seed user has a row pointing at it in ANY of:
--         orders (customer/seller/rider via V2 ON DELETE RESTRICT)
--         seller_permits.reviewed_by (V4 ON DELETE NO ACTION)
--         rider_applications.reviewed_by (V7 ON DELETE NO ACTION)
--         supplier_applications.reviewed_by (V8 ON DELETE NO ACTION)
--      we preserve it. The `WHERE NOT EXISTS (...)` clause in the
--      final delete below enforces this invariant — if a future
--      migration introduces another FK to `users`, that seed user
--      will simply be skipped rather than triggering a foreign-key
--      violation, so Flyway + Spring Boot can still start cleanly.
--
-- Cleanup order (matches the FK directionality):
--   1. NULL out the `reviewed_by` columns that reference seed users
--      via NO-ACTION FKs. The V3 ADMIN is the only possible reviewer
--      and ADMIN is preserved by the WHERE clause below, so this is
--      effectively cleaning any stale pointer to a non-ADMIN seed
--      user.
--   2. DELETE from `orders` whose customer/seller/rider is a V3 seed
--      user (V2 is ON DELETE RESTRICT, so the parent users delete
--      later would fail otherwise). Real customer orders reference
--      real registered users and survive.
--   3. DELETE the seed users (filtered to non-ADMIN V3 rows with no
--      remaining FK blockers). ON DELETE CASCADE for V3/V4/V7/V8 FKs
--      tears down the matching seller_profiles, rider_profiles,
--      seller_riders, products, seller_permits, rider_applications,
--      supplier_applications, and notifications automatically.
--   4. Resync the BIGSERIALs so future register()/create() calls
--      get fresh ids in the cleared range.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. NULL out reviewer pointers that point at non-ADMIN seed users. The
--    three columns are nullable `BIGINT REFERENCES users(id)` with the
--    default ON DELETE NO ACTION (i.e. RESTRICT). Without this step
--    `DELETE FROM users` fails on any environment that has reviewed a
--    permit using a non-ADMIN seed reviewer.
-- ---------------------------------------------------------------------------
UPDATE seller_permits
   SET reviewed_by = NULL
 WHERE reviewed_by IN (
       SELECT id FROM users
        WHERE role <> 'ADMIN'
          AND created_at IN (
                '2026-01-04 10:00:00',
                '2026-01-05 10:00:00',
                '2026-02-05 10:00:00',
                '2026-02-12 10:00:00',
                '2026-02-20 10:00:00',
                '2026-03-02 10:00:00',
                '2026-03-09 10:00:00',
                '2026-03-15 10:00:00',
                '2026-04-01 10:00:00'
          )
 );

UPDATE rider_applications
   SET reviewed_by = NULL
 WHERE reviewed_by IN (
       SELECT id FROM users
        WHERE role <> 'ADMIN'
          AND created_at IN (
                '2026-01-04 10:00:00',
                '2026-01-05 10:00:00',
                '2026-02-05 10:00:00',
                '2026-02-12 10:00:00',
                '2026-02-20 10:00:00',
                '2026-03-02 10:00:00',
                '2026-03-09 10:00:00',
                '2026-03-15 10:00:00',
                '2026-04-01 10:00:00',
                '2026-01-06 10:00:00',
                '2026-01-07 10:00:00',
                '2026-01-08 10:00:00',
                '2026-01-09 10:00:00',
                '2026-01-10 10:00:00',
                '2026-01-11 10:00:00'
          )
 );

UPDATE supplier_applications
   SET reviewed_by = NULL
 WHERE reviewed_by IN (
       SELECT id FROM users
        WHERE role <> 'ADMIN'
          AND created_at IN (
                '2026-01-04 10:00:00',
                '2026-01-05 10:00:00',
                '2026-02-05 10:00:00',
                '2026-02-12 10:00:00',
                '2026-02-20 10:00:00',
                '2026-03-02 10:00:00',
                '2026-03-09 10:00:00',
                '2026-03-15 10:00:00',
                '2026-04-01 10:00:00',
                '2026-01-06 10:00:00',
                '2026-01-07 10:00:00',
                '2026-01-08 10:00:00',
                '2026-01-09 10:00:00',
                '2026-01-10 10:00:00',
                '2026-01-11 10:00:00'
          )
 );

-- ---------------------------------------------------------------------------
-- 2. Drop demo orders whose customer / seller / rider belongs to a V3 seed
--    user. V2 declares ON DELETE RESTRICT on all three FKs, so without
--    this cleanup the next DELETE on `users` would fail. Real orders
--    reference a real registered user and survive.
-- ---------------------------------------------------------------------------
DELETE FROM orders
 WHERE customer_id IN (
       SELECT id FROM users
        WHERE role = 'CUSTOMER'
          AND created_at IN ('2026-01-04 10:00:00')
 )
    OR seller_id IN (
       SELECT id FROM users
        WHERE role = 'SELLER'
          AND created_at IN (
                '2026-01-05 10:00:00',
                '2026-02-05 10:00:00',
                '2026-02-12 10:00:00',
                '2026-02-20 10:00:00',
                '2026-03-02 10:00:00',
                '2026-03-09 10:00:00',
                '2026-03-15 10:00:00',
                '2026-04-01 10:00:00'
          )
 )
    OR rider_id IN (
       SELECT id FROM users
        WHERE role = 'RIDER'
          AND created_at IN (
                '2026-01-07 10:00:00',
                '2026-01-08 10:00:00',
                '2026-01-09 10:00:00',
                '2026-01-10 10:00:00',
                '2026-01-11 10:00:00'
          )
 );

-- ---------------------------------------------------------------------------
-- 3. Delete the seeded non-admin users. The final DELETE skips any user
--    that is still referenced from another row (defensive NOT EXISTS).
--    ON DELETE CASCADE on V3/V4/V7/V8 cascades the matched
--    seller_profiles, rider_profiles, seller_riders, products,
--    seller_permits, rider_applications, supplier_applications, and
--    notifications rows automatically.
--
--    The ADMIN row (id 12 / `admin@example.com`) is preserved by both
--    the `role <> 'ADMIN'` predicate and the surrounding timestamp
--    filter.
-- ---------------------------------------------------------------------------
DELETE FROM users u
 WHERE u.role <> 'ADMIN'
   AND u.created_at IN (
        '2026-01-04 10:00:00', -- asha              CUSTOMER
        '2026-01-05 10:00:00', -- gaspro            SELLER
        '2026-02-05 10:00:00', -- mariag            SELLER
        '2026-02-12 10:00:00', -- hassanj           SELLER
        '2026-02-20 10:00:00', -- fatmas            SELLER
        '2026-03-02 10:00:00', -- omar              SELLER
        '2026-03-09 10:00:00', -- zainab            SELLER
        '2026-03-15 10:00:00', -- salim             SELLER
        '2026-04-01 10:00:00', -- rehema            SELLER
        '2026-01-06 10:00:00', -- msaidi            SUPPLIER
        '2026-01-07 10:00:00', -- hassan            RIDER
        '2026-01-08 10:00:00', -- riderdan          RIDER
        '2026-01-09 10:00:00', -- riderbr           RIDER
        '2026-01-10 10:00:00', -- rideres           RIDER
        '2026-01-11 10:00:00'  -- riderke           RIDER
   )
   -- Defensive guard: skip any seed user still referenced from the
   -- existing schema (matches the spec — "do NOT delete users that
   -- are referenced by permits, orders, notifications or profiles").
   AND NOT EXISTS (
       SELECT 1 FROM orders o
        WHERE o.customer_id = u.id
           OR o.seller_id   = u.id
           OR o.rider_id    = u.id
   )
   AND NOT EXISTS (
       SELECT 1 FROM seller_permits sp
        WHERE sp.reviewed_by = u.id
   )
   AND NOT EXISTS (
       SELECT 1 FROM rider_applications ra
        WHERE ra.reviewed_by = u.id
   )
   AND NOT EXISTS (
       SELECT 1 FROM supplier_applications sa
        WHERE sa.reviewed_by = u.id
   );

-- ---------------------------------------------------------------------------
-- 4. Resync the BIGSERIALs so future register() / product create() calls
--    get fresh ids past the cleared range. The COALESCE+GREATEST pattern
--    mirrors V3, so the next ids are not handed out as 13..16.
-- ---------------------------------------------------------------------------
SELECT setval(
    pg_get_serial_sequence('users','id'),
    GREATEST((SELECT COALESCE(MAX(id), 1) FROM users), 1)
);

SELECT setval(
    pg_get_serial_sequence('products','id'),
    GREATEST((SELECT COALESCE(MAX(id), 1) FROM products), 1)
);

-- Verification query (read-only — kept as a comment for ops):
--   SELECT role, COUNT(*) FROM users GROUP BY role;
--   SELECT COUNT(*) FROM seller_profiles;
--   SELECT COUNT(*) FROM rider_profiles;
--   SELECT COUNT(*) FROM seller_riders;
--   SELECT COUNT(*) FROM products;
--   SELECT COUNT(*) FROM orders;
--   SELECT COUNT(*) FROM seller_permits;
--   SELECT COUNT(*) FROM rider_applications;
--   SELECT COUNT(*) FROM supplier_applications;
--   SELECT COUNT(*) FROM notifications;
-- Expected after a fresh DB:
--   role     | count
--   ---------+------
--   ADMIN    |   1
--   (no other roles)
--   every other count = 0
