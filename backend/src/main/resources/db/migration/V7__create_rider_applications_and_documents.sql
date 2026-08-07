-- =============================================================================
-- V7 — Rider Verification & Certification workflow.
-- =============================================================================
-- Adds the lifecycle + document storage for the rider permit module. The
-- existing seller permit schema (`seller_permits`, `permit_documents`) and
-- the strict CHECK constraint on `permit_documents.document_type` are left
-- untouched — this migration introduces two new tables that are scoped to
-- the rider flow only.
--
--   1. `rider_applications`  — 1:1 lifecycle row per rider, mirroring the
--                                shape of `seller_permits` (status,
--                                rejection_reason, reviewer audit trail).
--                                The single row per rider is enforced with
--                                a UNIQUE constraint on `rider_id` so
--                                re-submission after a rejection re-uses
--                                the same row.
--   2. `rider_permit_documents` — metadata for the rider's uploaded PDFs
--                                  (application form, national ID, driving
--                                  licence, passport photo, vehicle
--                                  registration, plus the issued
--                                  certificate). Bytes live on disk under
--                                  `<uploads>/rider-permits/<riderId>/...`;
--                                  `storage_key` is the relative path.
--                                  A unique (application, document_type)
--                                  index keeps the slot semantics clean —
--                                  re-uploading one slot replaces the prior
--                                  row.
--
-- Status lifecycle is identical to the seller permit module so the rider
-- approval / rejection UX is consistent across roles.
-- =============================================================================

-- ---- rider_applications --------------------------------------------------
CREATE TABLE IF NOT EXISTS rider_applications (
    id               BIGSERIAL    PRIMARY KEY,
    rider_id         BIGINT       NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    status           VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    rejection_reason TEXT,
    submitted_at     TIMESTAMP,
    reviewed_at      TIMESTAMP,
    reviewed_by      BIGINT       REFERENCES users(id),
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_rider_applications_status
        CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_rider_applications_status
    ON rider_applications(status);
CREATE INDEX IF NOT EXISTS idx_rider_applications_submitted_at
    ON rider_applications(submitted_at);

-- ---- rider_permit_documents ----------------------------------------------
-- Bytes live on disk; `storage_key` is the path relative to
-- `app.uploads.dir`. The CHECK constraint enumerates the rider-only
-- document types so a stale `seller_permits` value can never sneak in.
CREATE TABLE IF NOT EXISTS rider_permit_documents (
    id                    BIGSERIAL    PRIMARY KEY,
    rider_application_id  BIGINT       NOT NULL REFERENCES rider_applications(id) ON DELETE CASCADE,
    document_type         VARCHAR(30)  NOT NULL,
    storage_key           VARCHAR(500) NOT NULL,
    original_name         VARCHAR(255),
    size_bytes            BIGINT       NOT NULL CHECK (size_bytes > 0),
    content_type          VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    uploaded_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_rider_permit_documents_type
        CHECK (document_type IN (
            'RIDER_APPLICATION_FORM',
            'RIDER_NATIONAL_ID',
            'RIDER_DRIVING_LICENCE',
            'RIDER_PASSPORT_PHOTO',
            'RIDER_VEHICLE_REGISTRATION',
            'RIDER_PERMIT'
        ))
);

CREATE INDEX IF NOT EXISTS idx_rider_permit_documents_application
    ON rider_permit_documents(rider_application_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rider_permit_documents_type
    ON rider_permit_documents(rider_application_id, document_type);

-- ---- updated_at triggers -------------------------------------------------
-- Mirrors the V4 trigger pattern so JPA `@PreUpdate` and raw SQL updates
-- both refresh the column.
CREATE OR REPLACE FUNCTION rider_applications_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rider_applications_set_updated_at
    BEFORE UPDATE ON rider_applications
    FOR EACH ROW
    EXECUTE FUNCTION rider_applications_set_updated_at();