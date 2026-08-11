CREATE TABLE IF NOT EXISTS athlete_distinction_nominations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  type TEXT NOT NULL,
  award_month INTEGER NOT NULL CHECK (award_month BETWEEN 1 AND 12),
  award_year INTEGER NOT NULL CHECK (award_year >= 1900),
  nominated_at TIMESTAMPTZ NOT NULL,
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT athlete_distinction_nominations_workspace_athlete_type_year_month_unique
    UNIQUE (workspace_id, athlete_id, type, award_year, award_month)
);

CREATE INDEX IF NOT EXISTS athlete_distinction_nominations_workspace_athlete_idx
  ON athlete_distinction_nominations (workspace_id, athlete_id);

CREATE INDEX IF NOT EXISTS athlete_distinction_nominations_workspace_athlete_year_month_idx
  ON athlete_distinction_nominations (workspace_id, athlete_id, award_year DESC, award_month DESC);
