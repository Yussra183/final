-- =============================================================================
-- V17 — Ensure every active seller has the canonical gas-brand catalogue.
-- =============================================================================
-- V16 normalized the seed rows once, but sellers approved afterwards could
-- still become active without any canonical inventory. This migration
-- backfills every active seller idempotently and deactivates legacy generic
-- LPG rows that would otherwise surface invalid order options.
-- =============================================================================

UPDATE products
   SET active = FALSE,
       updated_at = CURRENT_TIMESTAMP
 WHERE active = TRUE
   AND category IN ('refill', 'new_cylinder')
   AND (
       name ILIKE 'LPG%'
       OR name ILIKE 'New Cylinder%'
       OR NOT (
           (name = 'Oryx Gas' AND size IN ('3 kg', '6 kg', '12.5 kg', '38 kg'))
        OR (name = 'Taifa Gas' AND size IN ('6 kg', '15 kg', '38 kg'))
        OR (name = 'Lake Gas' AND size IN ('6 kg', '15 kg', '38 kg'))
        OR (name = 'Manjis Gas' AND size IN ('6 kg', '15 kg', '38 kg'))
        OR (name = 'Mihan Gas' AND size IN ('6 kg', '15 kg', '38 kg'))
       )
   );

WITH active_sellers AS (
    SELECT id AS seller_id
      FROM users
     WHERE role = 'SELLER'
       AND is_active = TRUE
),
catalog(name, size, price, stock, description) AS (
    VALUES
        ('Oryx Gas',  '3 kg',    10000.00, 24, 'Oryx Gas refill — 3 kg cylinder.'),
        ('Oryx Gas',  '6 kg',    18000.00, 24, 'Oryx Gas refill — 6 kg cylinder.'),
        ('Oryx Gas',  '12.5 kg', 32000.00, 18, 'Oryx Gas refill — 12.5 kg cylinder.'),
        ('Oryx Gas',  '38 kg',   92000.00, 10, 'Oryx Gas refill — 38 kg cylinder.'),
        ('Taifa Gas', '6 kg',    18500.00, 24, 'Taifa Gas refill — 6 kg cylinder.'),
        ('Taifa Gas', '15 kg',   35500.00, 18, 'Taifa Gas refill — 15 kg cylinder.'),
        ('Taifa Gas', '38 kg',   93000.00, 10, 'Taifa Gas refill — 38 kg cylinder.'),
        ('Lake Gas',  '6 kg',    18500.00, 24, 'Lake Gas refill — 6 kg cylinder.'),
        ('Lake Gas',  '15 kg',   35500.00, 18, 'Lake Gas refill — 15 kg cylinder.'),
        ('Lake Gas',  '38 kg',   93000.00, 10, 'Lake Gas refill — 38 kg cylinder.'),
        ('Manjis Gas','6 kg',    18500.00, 24, 'Manjis Gas refill — 6 kg cylinder.'),
        ('Manjis Gas','15 kg',   35500.00, 18, 'Manjis Gas refill — 15 kg cylinder.'),
        ('Manjis Gas','38 kg',   93000.00, 10, 'Manjis Gas refill — 38 kg cylinder.'),
        ('Mihan Gas', '6 kg',    18500.00, 24, 'Mihan Gas refill — 6 kg cylinder.'),
        ('Mihan Gas', '15 kg',   35500.00, 18, 'Mihan Gas refill — 15 kg cylinder.'),
        ('Mihan Gas', '38 kg',   93000.00, 10, 'Mihan Gas refill — 38 kg cylinder.')
)
UPDATE products p
   SET active = TRUE,
       category = 'refill',
       updated_at = CURRENT_TIMESTAMP
  FROM active_sellers s
  JOIN catalog c
    ON TRUE
 WHERE p.seller_id = s.seller_id
   AND p.name = c.name
   AND p.size = c.size
   AND p.category IN ('refill', 'new_cylinder')
   AND p.active = FALSE;

WITH active_sellers AS (
    SELECT id AS seller_id
      FROM users
     WHERE role = 'SELLER'
       AND is_active = TRUE
),
catalog(name, size, price, stock, description) AS (
    VALUES
        ('Oryx Gas',  '3 kg',    10000.00, 24, 'Oryx Gas refill — 3 kg cylinder.'),
        ('Oryx Gas',  '6 kg',    18000.00, 24, 'Oryx Gas refill — 6 kg cylinder.'),
        ('Oryx Gas',  '12.5 kg', 32000.00, 18, 'Oryx Gas refill — 12.5 kg cylinder.'),
        ('Oryx Gas',  '38 kg',   92000.00, 10, 'Oryx Gas refill — 38 kg cylinder.'),
        ('Taifa Gas', '6 kg',    18500.00, 24, 'Taifa Gas refill — 6 kg cylinder.'),
        ('Taifa Gas', '15 kg',   35500.00, 18, 'Taifa Gas refill — 15 kg cylinder.'),
        ('Taifa Gas', '38 kg',   93000.00, 10, 'Taifa Gas refill — 38 kg cylinder.'),
        ('Lake Gas',  '6 kg',    18500.00, 24, 'Lake Gas refill — 6 kg cylinder.'),
        ('Lake Gas',  '15 kg',   35500.00, 18, 'Lake Gas refill — 15 kg cylinder.'),
        ('Lake Gas',  '38 kg',   93000.00, 10, 'Lake Gas refill — 38 kg cylinder.'),
        ('Manjis Gas','6 kg',    18500.00, 24, 'Manjis Gas refill — 6 kg cylinder.'),
        ('Manjis Gas','15 kg',   35500.00, 18, 'Manjis Gas refill — 15 kg cylinder.'),
        ('Manjis Gas','38 kg',   93000.00, 10, 'Manjis Gas refill — 38 kg cylinder.'),
        ('Mihan Gas', '6 kg',    18500.00, 24, 'Mihan Gas refill — 6 kg cylinder.'),
        ('Mihan Gas', '15 kg',   35500.00, 18, 'Mihan Gas refill — 15 kg cylinder.'),
        ('Mihan Gas', '38 kg',   93000.00, 10, 'Mihan Gas refill — 38 kg cylinder.')
)
INSERT INTO products (
    seller_id, name, size, price, stock, category, description, image, active
)
SELECT
    s.seller_id,
    c.name,
    c.size,
    c.price,
    c.stock,
    'refill',
    c.description,
    '🔥',
    TRUE
FROM active_sellers s
CROSS JOIN catalog c
WHERE NOT EXISTS (
    SELECT 1
      FROM products p
     WHERE p.seller_id = s.seller_id
       AND p.name = c.name
       AND p.size = c.size
);
