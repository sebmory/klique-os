CREATE TABLE IF NOT EXISTS membership_plans (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  duration_months INTEGER NULL CHECK (duration_months IS NULL OR duration_months > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  CHECK (btrim(code) <> ''),
  CHECK (btrim(name) <> ''),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS athlete_memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  membership_kind TEXT NOT NULL CHECK (membership_kind IN ('founder', 'subscription', 'trial', 'manual')),
  plan_code TEXT NULL REFERENCES membership_plans (code),
  status TEXT NOT NULL CHECK (status IN ('active', 'scheduled', 'expired', 'cancelled', 'past_due')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  payment_installments INTEGER NULL CHECK (payment_installments IS NULL OR payment_installments > 0),
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (btrim(workspace_id) <> ''),
  CHECK (btrim(athlete_id) <> ''),
  CHECK (btrim(source) <> ''),
  CHECK (ends_at IS NULL OR starts_at < ends_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_memberships_active_workspace_athlete_idx
  ON athlete_memberships (workspace_id, athlete_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS athlete_memberships_workspace_athlete_starts_idx
  ON athlete_memberships (workspace_id, athlete_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS athlete_memberships_plan_code_idx
  ON athlete_memberships (plan_code)
  WHERE plan_code IS NOT NULL;