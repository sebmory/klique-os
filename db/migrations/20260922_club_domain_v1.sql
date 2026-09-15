ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_id_type_key UNIQUE (id, type);

CREATE TABLE club_profiles (
  workspace_id TEXT PRIMARY KEY,
  workspace_type TEXT NOT NULL DEFAULT 'club',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT club_profiles_workspace_type_check
    CHECK (workspace_type = 'club'),
  CONSTRAINT club_profiles_workspace_fkey
    FOREIGN KEY (workspace_id, workspace_type)
    REFERENCES workspaces (id, type)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE TABLE club_teams (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT club_teams_workspace_id_id_key UNIQUE (workspace_id, id),
  CONSTRAINT club_teams_workspace_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES club_profiles (workspace_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT club_teams_workspace_id_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT club_teams_name_not_blank
    CHECK (NULLIF(btrim(name), '') IS NOT NULL),
  CONSTRAINT club_teams_season_not_blank
    CHECK (NULLIF(btrim(season), '') IS NOT NULL),
  CONSTRAINT club_teams_status_check
    CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX club_teams_workspace_name_season_unique
  ON club_teams (workspace_id, lower(btrim(name)), lower(btrim(season)));

CREATE INDEX club_teams_workspace_status_idx
  ON club_teams (workspace_id, status, season DESC);

CREATE TABLE team_athletes (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  team_id UUID NOT NULL,
  athlete_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  joined_on DATE NOT NULL,
  left_on DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT team_athletes_workspace_id_id_key UNIQUE (workspace_id, id),
  CONSTRAINT team_athletes_team_fkey
    FOREIGN KEY (workspace_id, team_id)
    REFERENCES club_teams (workspace_id, id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT team_athletes_workspace_id_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT team_athletes_athlete_id_not_blank
    CHECK (NULLIF(btrim(athlete_id), '') IS NOT NULL),
  CONSTRAINT team_athletes_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT team_athletes_dates_check
    CHECK (left_on IS NULL OR left_on >= joined_on),
  CONSTRAINT team_athletes_status_dates_check CHECK (
    (status = 'active' AND left_on IS NULL)
    OR (status = 'inactive' AND left_on IS NOT NULL)
  )
);

CREATE UNIQUE INDEX team_athletes_active_team_athlete_unique
  ON team_athletes (workspace_id, team_id, athlete_id)
  WHERE status = 'active';

CREATE INDEX team_athletes_workspace_team_status_idx
  ON team_athletes (workspace_id, team_id, status, joined_on DESC);

CREATE INDEX team_athletes_workspace_athlete_status_idx
  ON team_athletes (workspace_id, athlete_id, status, joined_on DESC);