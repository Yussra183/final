-- =============================================================================
-- V16 — Replace legacy generic LPG refill rows with the gas-brand catalogue.
-- =============================================================================
-- The schema already supports brand in `products.name` and cylinder size in
-- `products.size`; we only need to normalize the seeded data so the customer
-- order flow can resolve a real productId for the required brands/sizes.
--
-- Keep accessories intact. Deactivate the old generic refill / new-cylinder
-- rows, then insert one refill product per allowed (brand, size) pair for
-- every active seller.
-- =============================================================================

UPDATE products
   SET active = FALSE,
       updated_at = CURRENT_TIMESTAMP
 WHERE active = TRUE
   AND category IN ('refill', 'new_cylinder')
   AND (
       name ILIKE 'LPG%'
       OR name ILIKE 'New Cylinder%'
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
CROSS JOIN catalog c;
