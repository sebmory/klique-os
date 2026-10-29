BEGIN;

CREATE TABLE IF NOT EXISTS sports_watch_refresh_batches (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  scheduled_for DATE NOT NULL,
  task_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  message TEXT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  CONSTRAINT sports_watch_refresh_batches_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_refresh_batches_trigger_check CHECK (trigger = 'scheduled'),
  CONSTRAINT sports_watch_refresh_batches_status_check CHECK (
    status IN ('running', 'completed', 'partial', 'failed')
  ),
  CONSTRAINT sports_watch_refresh_batches_counts_check CHECK (
    task_count >= 0
    AND completed_count >= 0
    AND failed_count >= 0
    AND created_count >= 0
  ),
  CONSTRAINT sports_watch_refresh_batches_daily_unique UNIQUE (
    workspace_id,
    trigger,
    scheduled_for
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS sports_watch_refresh_batches_active_unique
  ON sports_watch_refresh_batches (workspace_id)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS sports_watch_refresh_batches_workspace_started_idx
  ON sports_watch_refresh_batches (workspace_id, started_at DESC);

CREATE TABLE IF NOT EXISTS sports_watch_refresh_tasks (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES sports_watch_refresh_batches(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  athlete_name_snapshot TEXT NOT NULL,
  athlete_sport_snapshot TEXT NOT NULL,
  athlete_club_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_expires_at TIMESTAMPTZ NULL,
  lease_token UUID NULL,
  scanned_count INTEGER NOT NULL DEFAULT 0,
  recent_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  message TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sports_watch_refresh_tasks_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_refresh_tasks_status_check CHECK (
    status IN ('pending', 'running', 'completed', 'failed')
  ),
  CONSTRAINT sports_watch_refresh_tasks_attempt_check CHECK (attempt_count BETWEEN 0 AND 2),
  CONSTRAINT sports_watch_refresh_tasks_counts_check CHECK (
    scanned_count >= 0 AND recent_count >= 0 AND created_count >= 0
  ),
  CONSTRAINT sports_watch_refresh_tasks_unique UNIQUE (batch_id, source_key, athlete_id)
);

ALTER TABLE sports_watch_refresh_tasks
  ADD COLUMN IF NOT EXISTS lease_token UUID NULL;

CREATE INDEX IF NOT EXISTS sports_watch_refresh_tasks_claim_idx
  ON sports_watch_refresh_tasks (status, created_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS sports_watch_refresh_tasks_active_source_unique
  ON sports_watch_refresh_tasks (source_key)
  WHERE status = 'running';

COMMIT;
