BEGIN;

CREATE TABLE IF NOT EXISTS sports_watch_safv_bindings (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  schedule_url TEXT NOT NULL,
  league_id TEXT NOT NULL,
  official_team_id TEXT NOT NULL,
  official_team_name_snapshot TEXT NOT NULL,
  competition_name_snapshot TEXT NOT NULL,
  season_id_snapshot TEXT NOT NULL,
  season_name_snapshot TEXT NOT NULL,
  club_comparison TEXT NOT NULL,
  verification_evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_at TIMESTAMPTZ NOT NULL,
  confirmed_by_clerk_user_id TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  disabled_by_clerk_user_id TEXT NULL,
  disabled_at TIMESTAMPTZ NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sports_watch_safv_bindings_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_safv_bindings_athlete_check CHECK (btrim(athlete_id) <> ''),
  CONSTRAINT sports_watch_safv_bindings_source_check CHECK (
    btrim(schedule_url) <> ''
    AND btrim(league_id) <> ''
    AND btrim(official_team_id) <> ''
    AND btrim(official_team_name_snapshot) <> ''
    AND btrim(competition_name_snapshot) <> ''
    AND btrim(season_id_snapshot) <> ''
    AND btrim(season_name_snapshot) <> ''
  ),
  CONSTRAINT sports_watch_safv_bindings_club_comparison_check CHECK (
    club_comparison IN ('matching', 'different', 'unknown')
  ),
  CONSTRAINT sports_watch_safv_bindings_version_check CHECK (version >= 1),
  CONSTRAINT sports_watch_safv_bindings_disabled_check CHECK (
    (active AND disabled_by_clerk_user_id IS NULL AND disabled_at IS NULL)
    OR (NOT active AND disabled_by_clerk_user_id IS NOT NULL AND disabled_at IS NOT NULL)
  ),
  CONSTRAINT sports_watch_safv_bindings_athlete_unique UNIQUE (workspace_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS sports_watch_safv_bindings_workspace_idx
  ON sports_watch_safv_bindings (workspace_id, active, updated_at DESC);

CREATE INDEX IF NOT EXISTS sports_watch_safv_bindings_team_idx
  ON sports_watch_safv_bindings (workspace_id, official_team_id)
  WHERE active;

COMMIT;
