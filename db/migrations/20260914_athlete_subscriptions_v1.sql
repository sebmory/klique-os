CREATE TABLE IF NOT EXISTS athlete_subscriptions (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('essentiel', 'impact', 'signature')),
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  is_founder BOOLEAN NOT NULL DEFAULT FALSE,
  is_complimentary BOOLEAN NOT NULL DEFAULT FALSE,
  price_chf NUMERIC(10, 2) NOT NULL CHECK (price_chf >= 0),
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (
    discount_percent >= 0 AND discount_percent <= 100
  ),
  photo_sessions_included INTEGER NOT NULL DEFAULT 0 CHECK (photo_sessions_included >= 0),
  media_days_included INTEGER NOT NULL DEFAULT 0 CHECK (media_days_included >= 0),
  competition_sessions_included INTEGER NOT NULL DEFAULT 0 CHECK (competition_sessions_included >= 0),
  custom_contents_included INTEGER NOT NULL DEFAULT 0 CHECK (custom_contents_included >= 0),
  created_by_clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (btrim(workspace_id) <> ''),
  CHECK (btrim(athlete_id) <> ''),
  CHECK (btrim(plan_code) <> ''),
  CHECK (btrim(status) <> ''),
  CHECK (btrim(created_by_clerk_user_id) <> ''),
  CHECK (ends_on > starts_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_subscriptions_active_workspace_athlete_idx
  ON athlete_subscriptions (workspace_id, athlete_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS athlete_subscriptions_workspace_athlete_idx
  ON athlete_subscriptions (workspace_id, athlete_id, starts_on DESC);

CREATE INDEX IF NOT EXISTS athlete_subscriptions_workspace_status_idx
  ON athlete_subscriptions (workspace_id, status, ends_on DESC);

CREATE INDEX IF NOT EXISTS athlete_subscriptions_athlete_status_idx
  ON athlete_subscriptions (athlete_id, status, ends_on DESC);