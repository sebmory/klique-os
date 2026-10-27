BEGIN;

CREATE TABLE IF NOT EXISTS sports_watch_bebasket_bindings (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  calendar_url TEXT NOT NULL,
  team_slug TEXT NOT NULL,
  team_name_snapshot TEXT NOT NULL,
  player_name_snapshot TEXT NOT NULL,
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
  CONSTRAINT sports_watch_bebasket_bindings_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_bebasket_bindings_athlete_check CHECK (btrim(athlete_id) <> ''),
  CONSTRAINT sports_watch_bebasket_bindings_source_check CHECK (
    calendar_url ~ '^https://www\.bebasket\.fr/equipe/[a-z0-9-]+/calendrier$'
    AND btrim(team_slug) <> ''
    AND btrim(team_name_snapshot) <> ''
    AND btrim(player_name_snapshot) <> ''
  ),
  CONSTRAINT sports_watch_bebasket_bindings_version_check CHECK (version >= 1),
  CONSTRAINT sports_watch_bebasket_bindings_disabled_check CHECK (
    (active AND disabled_by_clerk_user_id IS NULL AND disabled_at IS NULL)
    OR (NOT active AND disabled_by_clerk_user_id IS NOT NULL AND disabled_at IS NOT NULL)
  ),
  CONSTRAINT sports_watch_bebasket_bindings_athlete_unique UNIQUE (workspace_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS sports_watch_bebasket_bindings_workspace_idx
  ON sports_watch_bebasket_bindings (workspace_id, active, updated_at DESC);

CREATE INDEX IF NOT EXISTS sports_watch_bebasket_bindings_team_idx
  ON sports_watch_bebasket_bindings (workspace_id, team_slug)
  WHERE active;

COMMIT;
