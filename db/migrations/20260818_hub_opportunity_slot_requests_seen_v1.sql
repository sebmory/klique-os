ALTER TABLE hub_opportunity_slot_requests
  ADD COLUMN IF NOT EXISTS athlete_seen_at TIMESTAMPTZ NULL;
