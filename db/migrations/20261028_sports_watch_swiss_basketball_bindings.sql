BEGIN;

CREATE TABLE IF NOT EXISTS sports_watch_swiss_basketball_bindings (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  schedule_url TEXT NOT NULL,
  federation_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  season_name_snapshot TEXT NOT NULL,
  league_id TEXT NOT NULL,
  league_name_snapshot TEXT NOT NULL,
  official_team_id TEXT NOT NULL,
  official_team_name_snapshot TEXT NOT NULL,
  official_club_id TEXT NOT NULL,
  official_player_id TEXT NOT NULL,
  official_player_name_snapshot TEXT NOT NULL,
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
  CONSTRAINT sports_watch_swiss_basketball_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_swiss_basketball_athlete_check CHECK (btrim(athlete_id) <> ''),
  CONSTRAINT sports_watch_swiss_basketball_source_check CHECK (
    schedule_url ~ '^https://swiss\.basketball/'
    AND federation_id ~ '^[0-9]+$'
    AND season_id ~ '^[0-9]+$'
    AND league_id ~ '^[0-9]+$'
    AND official_team_id ~ '^[0-9]+$'
    AND official_club_id ~ '^[0-9]+$'
    AND official_player_id ~ '^[0-9]+$'
    AND btrim(season_name_snapshot) <> ''
    AND btrim(league_name_snapshot) <> ''
    AND btrim(official_team_name_snapshot) <> ''
    AND btrim(official_player_name_snapshot) <> ''
  ),
  CONSTRAINT sports_watch_swiss_basketball_version_check CHECK (version >= 1),
  CONSTRAINT sports_watch_swiss_basketball_disabled_check CHECK (
    (active AND disabled_by_clerk_user_id IS NULL AND disabled_at IS NULL)
    OR (NOT active AND disabled_by_clerk_user_id IS NOT NULL AND disabled_at IS NOT NULL)
  ),
  CONSTRAINT sports_watch_swiss_basketball_team_unique
    UNIQUE (workspace_id, athlete_id, season_id, league_id, official_team_id)
);

CREATE INDEX IF NOT EXISTS sports_watch_swiss_basketball_workspace_idx
  ON sports_watch_swiss_basketball_bindings (workspace_id, active, updated_at DESC);

CREATE INDEX IF NOT EXISTS sports_watch_swiss_basketball_collection_idx
  ON sports_watch_swiss_basketball_bindings (
    workspace_id, athlete_id, season_id, league_id, official_team_id
  )
  WHERE active;

COMMIT;
