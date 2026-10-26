BEGIN;

CREATE TABLE IF NOT EXISTS sports_watch_imports (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  athlete_name_snapshot TEXT NOT NULL,
  athlete_sport_snapshot TEXT NOT NULL,
  athlete_club_snapshot TEXT NOT NULL,
  uploaded_by_clerk_user_id TEXT NOT NULL,
  blob_pathname TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded',
  extraction_json JSONB NULL,
  extraction_provider TEXT NULL,
  extraction_model TEXT NULL,
  extraction_provider_response_id TEXT NULL,
  extraction_attempts INTEGER NOT NULL DEFAULT 0,
  extracted_at TIMESTAMPTZ NULL,
  confirmed_payload_json JSONB NULL,
  confirmed_by_clerk_user_id TEXT NULL,
  confirmed_at TIMESTAMPTZ NULL,
  candidate_id UUID NULL REFERENCES sports_watch_candidates(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sports_watch_imports_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_imports_athlete_check CHECK (btrim(athlete_id) <> ''),
  CONSTRAINT sports_watch_imports_file_check CHECK (
    btrim(blob_pathname) <> ''
    AND btrim(original_filename) <> ''
    AND content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
    AND size_bytes > 0
    AND size_bytes <= 10485760
    AND btrim(content_hash) <> ''
  ),
  CONSTRAINT sports_watch_imports_status_check CHECK (
    status IN ('uploaded', 'extracted', 'confirmed')
  ),
  CONSTRAINT sports_watch_imports_extraction_check CHECK (
    (status = 'uploaded' AND extraction_json IS NULL AND extracted_at IS NULL)
    OR (
      status IN ('extracted', 'confirmed')
      AND extraction_json IS NOT NULL
      AND extraction_provider IS NOT NULL
      AND extraction_model IS NOT NULL
      AND extracted_at IS NOT NULL
    )
  ),
  CONSTRAINT sports_watch_imports_confirmation_check CHECK (
    (status <> 'confirmed' AND confirmed_payload_json IS NULL AND confirmed_by_clerk_user_id IS NULL AND confirmed_at IS NULL AND candidate_id IS NULL)
    OR (status = 'confirmed' AND confirmed_payload_json IS NOT NULL AND confirmed_by_clerk_user_id IS NOT NULL AND confirmed_at IS NOT NULL AND candidate_id IS NOT NULL)
  ),
  CONSTRAINT sports_watch_imports_attempts_check CHECK (extraction_attempts >= 0),
  CONSTRAINT sports_watch_imports_version_check CHECK (version >= 1),
  CONSTRAINT sports_watch_imports_content_unique UNIQUE (workspace_id, athlete_id, content_hash)
);

CREATE INDEX IF NOT EXISTS sports_watch_imports_workspace_idx
  ON sports_watch_imports (workspace_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS sports_watch_imports_candidate_unique
  ON sports_watch_imports (candidate_id)
  WHERE candidate_id IS NOT NULL;

COMMIT;
