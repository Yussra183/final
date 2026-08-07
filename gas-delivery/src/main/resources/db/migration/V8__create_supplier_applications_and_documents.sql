-- =============================================================================
-- V8 — Supplier Verification & Approval workflow.
-- =============================================================================
-- Adds the lifecycle + document storage for the supplier verification
-- module. The existing seller permit schema (`seller_permits`,
-- `permit_documents`) and the rider schema (`rider_applications`,
-- `rider_permit_documents`) are left completely untouched — this
-- migration only introduces two new tables scoped to the supplier flow.
--
--   1. `supplier_applications`          — 1:1 lifecycle row per supplier,
--                                         mirroring the shape of
--                                         `rider_applications` (status,
--                                         rejection_reason, reviewer audit
--                                         trail). The single row per
--                                         supplier is enforced with a
--                                         UNIQUE constraint on
--                                         `supplier_id` so re-submission
--                                         after a rejection re-uses the
--                                         same row.
--   2. `supplier_application_documents` — metadata for the supplier's
--                                         uploaded documents (application
--                                         form, national ID, business
--                                         registration, TIN certificate,
--                                         business licence, passport
--                                         photo, plus the issued
--                                         certificate). Bytes live on disk
--                                         under
--                                         `<uploads>/supplier-applications/<supplierId>/...`;
--                                         `storage_key` is the relative
--                                         path. A unique
--                                         (application, document_type)
--                                         index keeps the slot semantics
--                                         clean — re-uploading one slot
--                                         replaces the prior row.
--
-- Status lifecycle is identical to the seller + rider permit modules so
-- the approval / rejection UX is consistent across every role.
-- =============================================================================

-- ---- supplier_applications ------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_applications (
    id               BIGSERIAL    PRIMARY KEY,
    supplier_id      BIGINT       NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    status           VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    rejection_reason TEXT,
    submitted_at     TIMESTAMP,
    reviewed_at      TIMESTAMP,
    reviewed_by      BIGINT       REFERENCES users(id),
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_supplier_applications_status
        CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_supplier_applications_status
    ON supplier_applications(status);
CREATE INDEX IF NOT EXISTS idx_supplier_applications_submitted_at
    ON supplier_applications(submitted_at);

-- ---- supplier_application_documents ----------------------------------------
-- Bytes live on disk; `storage_key` is the path relative to
-- `app.uploads.dir`. The CHECK constraint enumerates the supplier-only
-- document types so a stale seller/rider value can never sneak in.
CREATE TABLE IF NOT EXISTS supplier_application_documents (
    id                        BIGSERIAL    PRIMARY KEY,
    supplier_application_id   BIGINT       NOT NULL REFERENCES supplier_applications(id) ON DELETE CASCADE,
    document_type             VARCHAR(40)  NOT NULL,
    storage_key               VARCHAR(500) NOT NULL,
    original_name             VARCHAR(255),
    size_bytes                BIGINT       NOT NULL CHECK (size_bytes > 0),
    content_type              VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    uploaded_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_supplier_application_documents_type
        CHECK (document_type IN (
            'SUPPLIER_APPLICATION_FORM',
            'SUPPLIER_NATIONAL_ID',
            'SUPPLIER_BUSINESS_REGISTRATION',
            'SUPPLIER_TIN_CERTIFICATE',
            'SUPPLIER_BUSINESS_LICENCE',
            'SUPPLIER_PASSPORT_PHOTO',
            'SUPPLIER_CERTIFICATE'
        ))
);

CREATE INDEX IF NOT EXISTS idx_supplier_application_documents_application
    ON supplier_application_documents(supplier_application_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_application_documents_type
    ON supplier_application_documents(supplier_application_id, document_type);

-- ---- updated_at trigger ----------------------------------------------------
-- Mirrors the V4 / V7 trigger pattern so JPA `@PreUpdate` and raw SQL
-- updates both refresh the column.
CREATE OR REPLACE FUNCTION supplier_applications_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supplier_applications_set_updated_at ON supplier_applications;
CREATE TRIGGER trg_supplier_applications_set_updated_at
    BEFORE UPDATE ON supplier_applications
    FOR EACH ROW
    EXECUTE FUNCTION supplier_applications_set_updated_at();
