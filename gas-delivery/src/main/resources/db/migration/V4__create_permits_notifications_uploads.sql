-- =============================================================================
-- V4 — Seller Permit Verification + Notification persistence.
-- =============================================================================
-- The application previously auto-activated new sellers at registration, so
-- customers could place orders against unverified sellers and riders could
-- be assigned to them. This migration introduces the permit workflow:
--
--   1. `seller_permits`  — 1:1 lifecycle row per seller. Carries status,
--                           business name, rejection reason, and reviewer
--                           audit trail.
--   2. `permit_documents` — metadata for the three required PDFs (application
--                           form, birth certificate, national ID) plus the
--                           post-approval licence PDF. Bytes live on disk
--                           under the upload root configured by the
--                           `app.uploads.dir` Spring property; the
--                           `storage_key` column stores the relative path.
--   3. `notifications`   — persistent in-app feed. The frontend already
--                           declares `GET /api/notifications` and
--                           `PATCH /api/notifications/{id}/read`; this
--                           table is the backing store.
--
-- V1–V3 remain unchanged. Existing seeded sellers (rows 2–9) keep their
-- approved-by-default state because we never flip `is_active` away from
-- TRUE for them — `users.is_active` continues to be the single customer /
-- rider visibility signal.
-- =============================================================================

-- ---- seller_permits ------------------------------------------------------
CREATE TABLE IF NOT EXISTS seller_permits (
    id               BIGSERIAL    PRIMARY KEY,
    seller_id        BIGINT       NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    status           VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    business_name    VARCHAR(160) NOT NULL,
    rejection_reason TEXT,
    submitted_at     TIMESTAMP,
    reviewed_at      TIMESTAMP,
    reviewed_by      BIGINT       REFERENCES users(id),
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_seller_permits_status
        CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_seller_permits_status      ON seller_permits(status);
CREATE INDEX IF NOT EXISTS idx_seller_permits_submitted_at ON seller_permits(submitted_at);

-- ---- permit_documents ----------------------------------------------------
-- Bytes live on disk; `storage_key` is the path relative to
-- `app.uploads.dir`. A unique (permit, document_type) constraint keeps the
-- three required slots distinct (re-uploading a single slot just overwrites
-- the existing row inside the same transaction).
CREATE TABLE IF NOT EXISTS permit_documents (
    id            BIGSERIAL    PRIMARY KEY,
    permit_id     BIGINT       NOT NULL REFERENCES seller_permits(id) ON DELETE CASCADE,
    document_type VARCHAR(30)  NOT NULL,
    storage_key   VARCHAR(500) NOT NULL,
    original_name VARCHAR(255),
    size_bytes    BIGINT       NOT NULL CHECK (size_bytes > 0),
    content_type  VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    uploaded_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_permit_documents_type
        CHECK (document_type IN ('APPLICATION_FORM', 'BIRTH_CERTIFICATE', 'NATIONAL_ID', 'LICENSE'))
);

CREATE INDEX IF NOT EXISTS idx_permit_documents_permit ON permit_documents(permit_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_permit_documents_type
    ON permit_documents(permit_id, document_type);

-- ---- notifications -------------------------------------------------------
-- The frontend's NotificationItem type maps to: id, userId, title, message,
-- type, read, createdAt, data (arbitrary JSON blob the consumer can use to
-- deep-link to the relevant screen).
CREATE TABLE IF NOT EXISTS notifications (
    id         BIGSERIAL    PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(30)  NOT NULL,
    title      VARCHAR(160) NOT NULL,
    message    TEXT         NOT NULL,
    data       JSONB,
    is_read    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications(user_id) WHERE is_read = FALSE;

-- ---- updated_at triggers -------------------------------------------------
-- Mirrors the pattern used in V3 for `products` so JPA `@PreUpdate` and
-- raw SQL updates both refresh the column.
CREATE OR REPLACE FUNCTION seller_permits_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_seller_permits_set_updated_at
    BEFORE UPDATE ON seller_permits
    FOR EACH ROW
    EXECUTE FUNCTION seller_permits_set_updated_at();
