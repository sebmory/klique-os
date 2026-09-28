BEGIN;

CREATE TABLE IF NOT EXISTS content_after_match_packs (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  media_id UUID NULL,
  source_document_id TEXT NOT NULL,
  source_document_storage_version INTEGER NOT NULL,
  source_document_version_id TEXT NOT NULL,
  source_document_updated_at TIMESTAMPTZ NOT NULL,
  pack_type TEXT NOT NULL DEFAULT 'after_match',
  status TEXT NOT NULL DEFAULT 'pending',
  reel_status TEXT NOT NULL DEFAULT 'pending',
  stories_status TEXT NOT NULL DEFAULT 'pending',
  reel_attempt_count INTEGER NOT NULL DEFAULT 0,
  stories_attempt_count INTEGER NOT NULL DEFAULT 0,
  reel_variant_id TEXT NULL,
  stories_variant_id TEXT NULL,
  reel_credit_status TEXT NOT NULL DEFAULT 'pending',
  stories_credit_status TEXT NOT NULL DEFAULT 'pending',
  reel_credit_idempotency_key TEXT NULL,
  stories_credit_idempotency_key TEXT NULL,
  reel_error_code VARCHAR(64) NULL,
  stories_error_code VARCHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  CONSTRAINT content_after_match_packs_workspace_source_version_unique
    UNIQUE (workspace_id, source_document_id, source_document_storage_version),
  CONSTRAINT content_after_match_packs_source_document_fkey
    FOREIGN KEY (workspace_id, source_document_id)
    REFERENCES content_documents (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT content_after_match_packs_media_fkey
    FOREIGN KEY (workspace_id, media_id)
    REFERENCES media_organizations (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT content_after_match_packs_reel_variant_fkey
    FOREIGN KEY (workspace_id, reel_variant_id)
    REFERENCES content_variants (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT content_after_match_packs_stories_variant_fkey
    FOREIGN KEY (workspace_id, stories_variant_id)
    REFERENCES content_variants (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT content_after_match_packs_workspace_check
    CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT content_after_match_packs_user_check
    CHECK (btrim(user_id) <> ''),
  CONSTRAINT content_after_match_packs_source_document_check
    CHECK (btrim(source_document_id) <> ''),
  CONSTRAINT content_after_match_packs_source_storage_version_check
    CHECK (source_document_storage_version >= 1),
  CONSTRAINT content_after_match_packs_source_version_id_check
    CHECK (btrim(source_document_version_id) <> ''),
  CONSTRAINT content_after_match_packs_type_check
    CHECK (pack_type = 'after_match'),
  CONSTRAINT content_after_match_packs_status_check
    CHECK (status IN ('pending', 'generating', 'partial', 'completed', 'failed')),
  CONSTRAINT content_after_match_packs_reel_status_check
    CHECK (reel_status IN ('pending', 'generating', 'completed', 'failed')),
  CONSTRAINT content_after_match_packs_stories_status_check
    CHECK (stories_status IN ('pending', 'generating', 'completed', 'failed')),
  CONSTRAINT content_after_match_packs_attempt_counts_check
    CHECK (reel_attempt_count >= 0 AND stories_attempt_count >= 0),
  CONSTRAINT content_after_match_packs_reel_variant_state_check
    CHECK ((reel_status = 'completed') = (reel_variant_id IS NOT NULL)),
  CONSTRAINT content_after_match_packs_stories_variant_state_check
    CHECK ((stories_status = 'completed') = (stories_variant_id IS NOT NULL)),
  CONSTRAINT content_after_match_packs_completed_state_check
    CHECK ((status = 'completed') = (reel_status = 'completed' AND stories_status = 'completed')),
  CONSTRAINT content_after_match_packs_credit_status_check
    CHECK (
      reel_credit_status IN ('pending', 'not_required', 'not_consumed', 'consumed', 'refund_pending', 'refunded')
      AND stories_credit_status IN ('pending', 'not_required', 'not_consumed', 'consumed', 'refund_pending', 'refunded')
    ),
  CONSTRAINT content_after_match_packs_reel_credit_key_check
    CHECK (
      reel_credit_status IN ('pending', 'not_required')
      OR NULLIF(btrim(reel_credit_idempotency_key), '') IS NOT NULL
    ),
  CONSTRAINT content_after_match_packs_stories_credit_key_check
    CHECK (
      stories_credit_status IN ('pending', 'not_required')
      OR NULLIF(btrim(stories_credit_idempotency_key), '') IS NOT NULL
    ),
  CONSTRAINT content_after_match_packs_reel_completed_credit_check
    CHECK (reel_status <> 'completed' OR reel_credit_status IN ('not_required', 'consumed')),
  CONSTRAINT content_after_match_packs_stories_completed_credit_check
    CHECK (stories_status <> 'completed' OR stories_credit_status IN ('not_required', 'consumed')),
  CONSTRAINT content_after_match_packs_reel_error_code_check
    CHECK (
      (reel_status = 'failed' AND reel_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$')
      OR (reel_status <> 'failed' AND reel_error_code IS NULL)
    ),
  CONSTRAINT content_after_match_packs_stories_error_code_check
    CHECK (
      (stories_status = 'failed' AND stories_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$')
      OR (stories_status <> 'failed' AND stories_error_code IS NULL)
    ),
  CONSTRAINT content_after_match_packs_lifecycle_dates_check
    CHECK (
      (status = 'pending' AND started_at IS NULL AND finished_at IS NULL)
      OR (status = 'generating' AND started_at IS NOT NULL AND finished_at IS NULL)
      OR (status IN ('partial', 'completed', 'failed') AND started_at IS NOT NULL AND finished_at IS NOT NULL)
    ),
  CONSTRAINT content_after_match_packs_date_order_check
    CHECK (
      updated_at >= created_at
      AND (started_at IS NULL OR started_at >= created_at)
      AND (finished_at IS NULL OR started_at IS NOT NULL AND finished_at >= started_at)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS content_after_match_packs_workspace_id_idx
  ON content_after_match_packs (workspace_id, id);

CREATE INDEX IF NOT EXISTS content_after_match_packs_workspace_source_idx
  ON content_after_match_packs (workspace_id, source_document_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS content_after_match_packs_media_source_idx
  ON content_after_match_packs (workspace_id, media_id, source_document_id);

CREATE INDEX IF NOT EXISTS content_after_match_packs_stuck_generating_idx
  ON content_after_match_packs (workspace_id, updated_at)
  WHERE status = 'generating';

COMMIT;