CREATE TABLE IF NOT EXISTS hub_opportunity_slots (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES hub_opportunities(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 20),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hub_opportunity_slots_time_range_check CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS hub_opportunity_slots_opportunity_starts_at_idx
  ON hub_opportunity_slots (opportunity_id, starts_at);

CREATE TABLE IF NOT EXISTS hub_opportunity_slot_requests (
  id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES hub_opportunity_slots(id) ON DELETE CASCADE,
  opportunity_id TEXT NOT NULL REFERENCES hub_opportunities(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  clerk_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'declined', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hub_opportunity_slot_requests_opportunity_athlete_unique
    UNIQUE (opportunity_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS hub_opportunity_slot_requests_slot_status_idx
  ON hub_opportunity_slot_requests (slot_id, status);

CREATE INDEX IF NOT EXISTS hub_opportunity_slot_requests_workspace_opportunity_idx
  ON hub_opportunity_slot_requests (workspace_id, opportunity_id);
