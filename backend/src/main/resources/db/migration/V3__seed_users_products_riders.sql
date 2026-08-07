-- =============================================================================
-- V3 — Seller / Rider / Product schema + seed bootstrap.
-- =============================================================================
-- The Order Flow (V2) is fully wired but the rest of the app (customer home,
-- product list, seller dashboard) reads from in-memory seeds in the
-- frontend's `src/store/data.ts`. To make the Order Flow end-to-end usable
-- through the UI, we add:
--
--   1. `seller_profiles`  — 1:1 extension of `users` for seller-role rows
--                            (business name, address, lat/lng, rating, etc.).
--   2. `rider_profiles`   — 1:1 extension of `users` for rider-role rows
--                            (motorcycle plate/model, license, availability).
--   3. `seller_riders`    — many-to-many seller↔rider assignment, the data
--                            behind each seller's "team of riders".
--   4. `products`         — gas inventory per seller, the data the customer
--                            home browses and `OrderItem` snapshots.
--
-- Numeric IDs are seeded for the existing frontend users so the JS-side
-- seed data can switch its `"u-sell-1"` style ids to plain `"2"` and stay
-- consistent end-to-end.
--
-- After this migration, the customer can register, the seller can be
-- loaded via /api/sellers, and the order lifecycle (place → accept →
-- claim → pick-up → in_transit → delivered) runs against the same rows.
-- =============================================================================

-- ---- seller_profiles ----------------------------------------------------
CREATE TABLE IF NOT EXISTS seller_profiles (
    user_id        BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    business_name  VARCHAR(160) NOT NULL,
    address        VARCHAR(500) NOT NULL,
    district       VARCHAR(120),
    region         VARCHAR(120),
    lat            DOUBLE PRECISION,
    lng            DOUBLE PRECISION,
    phone          VARCHAR(30),
    rating         NUMERIC(3,2)  NOT NULL DEFAULT 0.0,
    open_now       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---- rider_profiles -----------------------------------------------------
CREATE TABLE IF NOT EXISTS rider_profiles (
    user_id        BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    vehicle_type   VARCHAR(40)  NOT NULL DEFAULT 'motorcycle',
    vehicle_plate  VARCHAR(40),
    vehicle_model  VARCHAR(80),
    license_no     VARCHAR(80),
    available      BOOLEAN      NOT NULL DEFAULT TRUE,
    phone          VARCHAR(30),
    lat            DOUBLE PRECISION,
    lng            DOUBLE PRECISION,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---- seller_riders ------------------------------------------------------
-- Each seller has a team of riders that get the broadcast when the seller
-- accepts an order. The dispatch queue (GET /api/orders/dispatch/available)
-- narrows to orders whose seller_id appears in this table for the actor rider.
CREATE TABLE IF NOT EXISTS seller_riders (
    seller_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rider_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (seller_id, rider_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_riders_rider ON seller_riders(rider_id);

-- ---- products -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id            BIGSERIAL    PRIMARY KEY,
    seller_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          VARCHAR(160) NOT NULL,
    size          VARCHAR(40)  NOT NULL,
    price         NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    stock         INT          NOT NULL DEFAULT 0 CHECK (stock >= 0),
    category      VARCHAR(40)  NOT NULL DEFAULT 'refill',
    description   VARCHAR(500),
    image         VARCHAR(40),
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id, active);
CREATE INDEX IF NOT EXISTS idx_products_active  ON products(active);

-- Maintain updated_at on UPDATE.
CREATE OR REPLACE FUNCTION products_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_set_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION products_set_updated_at();

-- =============================================================================
-- SEED BOOTSTRAP — mirrors `src/store/data.ts` users/sellers/products/rider.
-- IDs are explicit so the frontend can keep its "u-sell-1" / "p-1" seeds as
-- plain numeric strings ("2", "3", ...) without breaking the Order Flow FKs.
--
-- IMPORTANT: this section runs only on a fresh DB (or one where the seed
-- usernames are not already taken). The ON CONFLICT clause keeps the
-- migration idempotent — re-runs are no-ops.
-- =============================================================================

-- ---- Seed users (id 1..16) ---------------------------------------------
-- Password is BCrypt for "Password1!" — generated with strength 10.
-- All seeded users share the same password so the E2E test (and any UI
-- login) can use "Password1!" against any seeded username.
INSERT INTO users (id, full_name, username, email, password_hash, phone, role, is_active, created_at, updated_at) VALUES
  (1,  'Asha Mwakanyemba', 'asha',     'asha@example.com',     '$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+255700000001', 'CUSTOMER', TRUE, '2026-01-04 10:00:00', '2026-01-04 10:00:00'),
  (2,  'John Gas Seller',   'gaspro',   'seller@example.com',  '$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+255700000002', 'SELLER',   TRUE, '2026-01-05 10:00:00', '2026-01-05 10:00:00'),
  (3,  'Maria Mwendapole',  'mariag',   'maria@example.com',   '$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+255711222333', 'SELLER',   TRUE, '2026-02-05 10:00:00', '2026-02-05 10:00:00'),
  (4,  'Hassan Juma',       'hassanj',  'hassan.j@example.com','$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+255713333444', 'SELLER',   TRUE, '2026-02-12 10:00:00', '2026-02-12 10:00:00'),
  (5,  'Fatma Said',        'fatmas',   'fatma@example.com',   '$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+255715555666', 'SELLER',   TRUE, '2026-02-20 10:00:00', '2026-02-20 10:00:00'),
  (6,  'Omar Bakari',       'omar',     'omar@example.com',    '$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+255717777888', 'SELLER',   TRUE, '2026-03-02 10:00:00', '2026-03-02 10:00:00'),
  (7,  'Zainab Ali',        'zainab',   'zainab@example.com',  '$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+255719999000', 'SELLER',   TRUE, '2026-03-09 10:00:00', '2026-03-09 10:00:00'),
  (8,  'Salim Khamis',      'salim',    'salim@example.com',   '$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+255720111222', 'SELLER',   TRUE, '2026-03-15 10:00:00', '2026-03-15 10:00:00'),
  (9,  'Rehema Hassan',     'rehema',   'rehema@example.com',  '$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+255722333444', 'SELLER',   TRUE, '2026-04-01 10:00:00', '2026-04-01 10:00:00'),
  (10, 'Msaidi Suppliers',  'msaidi',   'supplier@example.com','$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+255700000003', 'SUPPLIER', TRUE, '2026-01-06 10:00:00', '2026-01-06 10:00:00'),
  (11, 'Hassan Rider',      'hassan',   'rider@example.com',   '$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+255700000004', 'RIDER',    TRUE, '2026-01-07 10:00:00', '2026-01-07 10:00:00'),
  (12, 'System Admin',      'admin',    'admin@example.com',   '$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+255700000005', 'ADMIN',    TRUE, '2026-01-01 10:00:00', '2026-01-01 10:00:00'),
  (13, 'Daniel Mwangi',     'riderdan', 'rider1@example.com',  '$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+254712345001', 'RIDER',    TRUE, '2026-01-08 10:00:00', '2026-01-08 10:00:00'),
  (14, 'Brian Otieno',      'riderbr',  'rider2@example.com',  '$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+254712345002', 'RIDER',    TRUE, '2026-01-09 10:00:00', '2026-01-09 10:00:00'),
  (15, 'Esther Wanjiku',    'rideres',  'rider3@example.com',  '$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+254712345003', 'RIDER',    TRUE, '2026-01-10 10:00:00', '2026-01-10 10:00:00'),
  (16, 'Kelvin Mutiso',     'riderke',  'rider4@example.com',  '$2b$10$vygNwGG8re3H4yAp73v.5eHmfWmdzi/CfqnWgIVniiORnKBbzBCLK', '+254712345004', 'RIDER',    TRUE, '2026-01-11 10:00:00', '2026-01-11 10:00:00')
ON CONFLICT (id) DO NOTHING;

-- Keep the BIGSERIAL sequence ahead of the seeded ids so future
-- register() calls (which don't specify id) get fresh numbers.
SELECT setval('users_id_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM users), 1));

-- ---- Seed seller_profiles ----------------------------------------------
INSERT INTO seller_profiles (user_id, business_name, address, district, region, lat, lng, phone, rating, open_now) VALUES
  (2, 'GasPro Supplies',          'Kariakoo Market, Block D, Dar es Salaam',  'Kariakoo',     'Dar es Salaam', -6.8235, 39.2695, '+255700000002', 4.7, TRUE),
  (3, 'Quick Gas Mikocheni',      'Mikocheni B, Near Shoppers Plaza',        'Mikocheni',    'Dar es Salaam', -6.7631, 39.2403, '+255711222333', 4.5, TRUE),
  (4, 'Sinza Gas Point',          'Sinza B, Dar es Salaam',                  'Sinza',        'Dar es Salaam', -6.7820, 39.2150, '+255713333444', 4.2, FALSE),
  (5, 'Mbezi LPG Center',         'Mbezi Beach, Bagamoyo Road',              'Mbezi',        'Dar es Salaam', -6.7100, 39.2200, '+255715555666', 4.8, TRUE),
  (6, 'Omar Gas Services',        'Chwaka Central, Zanzibar',                'Chwaka',       'Zanzibar',      -6.1350, 39.3050, '+255717777888', 4.3, TRUE),
  (7, 'Zainab LPG Hub',           'Uroa Junction, Zanzibar',                 'Uroa',         'Zanzibar',      -6.1200, 39.3450, '+255719999000', 4.6, TRUE),
  (8, 'Salim Gas & Co',           'Marumbi Village, Zanzibar',               'Marumbi',      'Zanzibar',      -6.1050, 39.3850, '+255720111222', 4.1, TRUE),
  (9, 'Rehema LPG Outlets',       'Fuoni Bondeni, Zanzibar',                 'Fuoni',        'Zanzibar',      -6.2050, 39.1800, '+255722333444', 4.4, TRUE)
ON CONFLICT (user_id) DO NOTHING;

-- ---- Seed rider_profiles (motorcycle + availability) ------------------
INSERT INTO rider_profiles (user_id, vehicle_type, vehicle_plate, vehicle_model, license_no, available, phone, lat, lng) VALUES
  (11, 'motorcycle', 'T 100 ABC', 'Honda CG125',     'TZ-RD-001', TRUE, '+255700000004', -6.8235, 39.2695),
  (13, 'motorcycle', 'KAA 200A',  'Boda Boda',       'KE-RD-100', TRUE, '+254712345001', -1.2864, 36.8172),
  (14, 'motorcycle', 'KAA 201B',  'Boda Boda',       'KE-RD-101', TRUE, '+254712345002', -1.2921, 36.8219),
  (15, 'motorcycle', 'KAA 202C',  'Pickup Truck',    'KE-RD-102', TRUE, '+254712345003', -1.3002, 36.8264),
  (16, 'motorcycle', 'KAA 203D',  'Boda Boda',       'KE-RD-103', FALSE,'+254712345004', -1.3110, 36.8350)
ON CONFLICT (user_id) DO NOTHING;

-- ---- Seed seller_riders (each seller has 2-3 riders) -------------------
-- Every rider is assigned to seller #2 (GasPro) so a single rider can
-- always pick up an order from any seed seller in the E2E test.
INSERT INTO seller_riders (seller_id, rider_id) VALUES
  (2, 11),
  (2, 13),
  (2, 14),
  (3, 11),
  (3, 13),
  (4, 14),
  (4, 15),
  (5, 11),
  (5, 15),
  (6, 16),
  (7, 16),
  (8, 13),
  (8, 14),
  (9, 15)
ON CONFLICT (seller_id, rider_id) DO NOTHING;

-- ---- Seed products ----------------------------------------------------
-- Mirrors the seedProducts array in `src/store/data.ts`.
INSERT INTO products (id, seller_id, name, size, price, stock, category, description, image, active) VALUES
  (1, 2, 'LPG Cylinder Refill',  '6kg',      18000.00, 42, 'refill',       'Standard 6kg cooking gas refill, certified and safety tested.',          '🔥', TRUE),
  (2, 2, 'LPG Cylinder Refill',  '13kg',     32000.00, 28, 'refill',       'Family-size 13kg cooking gas refill.',                                  '🔥', TRUE),
  (3, 2, 'LPG Cylinder Refill',  '22kg',     54000.00, 15, 'refill',       'Commercial 22kg cooking gas refill.',                                   '🔥', TRUE),
  (4, 2, 'New Cylinder (empty)', '13kg',     75000.00, 8,  'new_cylinder', 'Brand new 13kg empty cylinder with valve.',                             '🛢️', TRUE),
  (5, 2, 'Gas Regulator',        'Standard', 8500.00,  30, 'accessory',    'Compatible pressure regulator with hose.',                              '⚙️', TRUE),
  (6, 3, 'LPG Cylinder Refill',  '6kg',      18500.00, 20, 'refill',       'Quick refill — 6kg, picked up same day.',                               '🔥', TRUE),
  (7, 3, 'LPG Cylinder Refill',  '13kg',     31500.00, 12, 'refill',       'Mikocheni-bestseller 13kg refill.',                                     '🔥', TRUE),
  (8, 4, 'LPG Cylinder Refill',  '13kg',     32500.00, 18, 'refill',       'Sinza-stocked 13kg refill.',                                            '🔥', TRUE),
  (9, 4, 'LPG Cylinder Refill',  '22kg',     54500.00, 10, 'refill',       'Sinza-stocked 22kg refill.',                                            '🔥', TRUE),
  (10, 5, 'LPG Cylinder Refill', '6kg',      17800.00, 35, 'refill',       'Mbezi LPG 6kg refill.',                                                 '🔥', TRUE),
  (11, 5, 'LPG Cylinder Refill', '13kg',     31900.00, 25, 'refill',       'Mbezi LPG 13kg refill.',                                                '🔥', TRUE),
  (12, 5, 'LPG Cylinder Refill', '22kg',     53800.00, 12, 'refill',       'Mbezi LPG 22kg refill.',                                                '🔥', TRUE)
ON CONFLICT (id) DO NOTHING;

SELECT setval('products_id_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM products), 1));