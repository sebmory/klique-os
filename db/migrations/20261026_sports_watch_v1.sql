BEGIN;

CREATE TABLE IF NOT EXISTS sports_watch_runs (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  athlete_name_snapshot TEXT NOT NULL,
  started_by_clerk_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  scanned_count INTEGER NOT NULL DEFAULT 0,
  recent_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  message TEXT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NULL,
  CONSTRAINT sports_watch_runs_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_runs_source_check CHECK (btrim(source_key) <> ''),
  CONSTRAINT sports_watch_runs_status_check CHECK (status IN ('running', 'completed', 'failed')),
  CONSTRAINT sports_watch_runs_counts_check CHECK (
    scanned_count >= 0 AND recent_count >= 0 AND created_count >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS sports_watch_runs_active_unique
  ON sports_watch_runs (workspace_id, source_key)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS sports_watch_runs_workspace_started_idx
  ON sports_watch_runs (workspace_id, started_at DESC);

CREATE TABLE IF NOT EXISTS sports_watch_candidates (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  athlete_name_snapshot TEXT NOT NULL,
  athlete_sport_snapshot TEXT NOT NULL,
  athlete_club_snapshot TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  article_url TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  result_kind TEXT NOT NULL,
  publication_date TIMESTAMPTZ NULL,
  event_date_from DATE NULL,
  event_date_to DATE NULL,
  collected_at TIMESTAMPTZ NOT NULL,
  attribution_status TEXT NOT NULL,
  attribution_evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  factual_verification_status TEXT NOT NULL DEFAULT 'unverified',
  admin_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by_clerk_user_id TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  logical_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  supersedes_candidate_id UUID NULL REFERENCES sports_watch_candidates(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sports_watch_candidates_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_candidates_result_kind_check CHECK (
    result_kind IN ('individual_result', 'collective_result', 'participation', 'news_excerpt')
  ),
  CONSTRAINT sports_watch_candidates_attribution_check CHECK (
    attribution_status IN ('matched', 'ambiguous')
  ),
  CONSTRAINT sports_watch_candidates_verification_check CHECK (
    factual_verification_status IN ('unverified', 'verified', 'disputed')
  ),
  CONSTRAINT sports_watch_candidates_admin_status_check CHECK (
    admin_status IN ('pending', 'validated', 'rejected')
  ),
  CONSTRAINT sports_watch_candidates_version_check CHECK (version >= 1),
  CONSTRAINT sports_watch_candidates_dates_check CHECK (
    event_date_to IS NULL OR event_date_from IS NULL OR event_date_to >= event_date_from
  ),
  CONSTRAINT sports_watch_candidates_review_check CHECK (
    (admin_status = 'pending' AND reviewed_by_clerk_user_id IS NULL AND reviewed_at IS NULL)
    OR (admin_status <> 'pending' AND reviewed_by_clerk_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT sports_watch_candidates_content_unique
    UNIQUE (workspace_id, athlete_id, logical_key, content_hash)
);

CREATE INDEX IF NOT EXISTS sports_watch_candidates_admin_idx
  ON sports_watch_candidates (workspace_id, admin_status, collected_at DESC);

CREATE INDEX IF NOT EXISTS sports_watch_candidates_logical_idx
  ON sports_watch_candidates (workspace_id, athlete_id, logical_key, created_at DESC);

COMMIT;
