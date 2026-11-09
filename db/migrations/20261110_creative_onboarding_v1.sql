BEGIN;

ALTER TABLE creative_profiles
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_message TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_validated_at TIMESTAMPTZ;

UPDATE creative_profiles
SET onboarding_status = CASE
  WHEN status = 'active' THEN 'active'
  ELSE 'disabled'
END
WHERE onboarding_status IS NULL;

ALTER TABLE creative_profiles
  ALTER COLUMN onboarding_status SET DEFAULT 'invitation_to_send',
  ALTER COLUMN onboarding_status SET NOT NULL;

ALTER TABLE creative_profiles
  DROP CONSTRAINT IF EXISTS creative_profiles_onboarding_status_check;

ALTER TABLE creative_profiles
  ADD CONSTRAINT creative_profiles_onboarding_status_check
  CHECK (onboarding_status IN (
    'invitation_to_send',
    'invitation_sent',
    'account_created',
    'profile_incomplete',
    'pending_validation',
    'active',
    'disabled'
  ));

ALTER TABLE creative_invitations
  ADD COLUMN IF NOT EXISTS admin_message TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS creative_profiles_workspace_id_id_idx
  ON creative_profiles (workspace_id, id);

CREATE TABLE IF NOT EXISTS creative_onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  creative_profile_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (btrim(event_type) <> ''),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_clerk_user_id TEXT NOT NULL CHECK (btrim(actor_clerk_user_id) <> ''),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creative_onboarding_events_profile_fk
    FOREIGN KEY (workspace_id, creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS creative_onboarding_events_profile_created_idx
  ON creative_onboarding_events (workspace_id, creative_profile_id, created_at DESC);

CREATE OR REPLACE FUNCTION reject_creative_onboarding_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'creative_onboarding_events is immutable';
END;
$$;

DROP TRIGGER IF EXISTS creative_onboarding_events_immutable
  ON creative_onboarding_events;

CREATE TRIGGER creative_onboarding_events_immutable
BEFORE UPDATE OR DELETE ON creative_onboarding_events
FOR EACH ROW EXECUTE FUNCTION reject_creative_onboarding_event_mutation();

COMMENT ON COLUMN creative_profiles.onboarding_status IS
  'Admin-visible onboarding state; independent from Clerk authentication and creative access.';
COMMENT ON COLUMN creative_profiles.onboarding_message IS
  'Optional onboarding message supplied by an Admin; never contains Clerk secrets.';
COMMENT ON TABLE creative_onboarding_events IS
  'Append-only audit trail for creative onboarding transitions.';

COMMIT;
