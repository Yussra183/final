-- =============================================================================
-- V1 — Create the `users` table for the authentication module.
-- =============================================================================
-- This is the foundation for every role-specific module
-- (Customer, Seller, Supplier, Rider, Admin) — they all authenticate
-- through this single table and use the `role` column to differentiate.
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL    PRIMARY KEY,
    full_name       VARCHAR(120) NOT NULL,
    username        VARCHAR(60)  NOT NULL,
    email           VARCHAR(180) NOT NULL,
    password_hash   VARCHAR(200) NOT NULL,
    phone           VARCHAR(30),
    role            VARCHAR(30)  NOT NULL,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique indexes enforce email and username uniqueness at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email    ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username);