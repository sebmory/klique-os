BEGIN;

CREATE TABLE IF NOT EXISTS sports_watch_swiss_bindings (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  profile_url TEXT NOT NULL,
  profile_uuid UUID NOT NULL,
  official_player_id TEXT NOT NULL,
  official_name_snapshot TEXT NOT NULL,
  official_club_snapshot TEXT NULL,
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
  CONSTRAINT sports_watch_swiss_bindings_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_swiss_bindings_athlete_check CHECK (btrim(athlete_id) <> ''),
  CONSTRAINT sports_watch_swiss_bindings_profile_check CHECK (
    btrim(profile_url) <> '' AND btrim(official_player_id) <> '' AND btrim(official_name_snapshot) <> ''
  ),
  CONSTRAINT sports_watch_swiss_bindings_club_comparison_check CHECK (
    club_comparison IN ('matching', 'different', 'unknown')
  ),
  CONSTRAINT sports_watch_swiss_bindings_version_check CHECK (version >= 1),
  CONSTRAINT sports_watch_swiss_bindings_disabled_check CHECK (
    (active AND disabled_by_clerk_user_id IS NULL AND disabled_at IS NULL)
    OR (NOT active AND disabled_by_clerk_user_id IS NOT NULL AND disabled_at IS NOT NULL)
  ),
  CONSTRAINT sports_watch_swiss_bindings_athlete_unique UNIQUE (workspace_id, athlete_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS sports_watch_swiss_bindings_active_player_unique
  ON sports_watch_swiss_bindings (workspace_id, official_player_id)
  WHERE active;

CREATE UNIQUE INDEX IF NOT EXISTS sports_watch_swiss_bindings_active_profile_unique
  ON sports_watch_swiss_bindings (workspace_id, profile_uuid)
  WHERE active;

CREATE INDEX IF NOT EXISTS sports_watch_swiss_bindings_workspace_idx
  ON sports_watch_swiss_bindings (workspace_id, active, updated_at DESC);

COMMIT;
