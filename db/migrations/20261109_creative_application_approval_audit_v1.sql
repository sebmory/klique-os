BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS creative_onboarding_events_application_approved_idx
  ON creative_onboarding_events (workspace_id, creative_profile_id, event_type)
  WHERE event_type = 'application_approved';

COMMENT ON INDEX creative_onboarding_events_application_approved_idx IS
  'Guarantees one append-only approval event per canonical Forms creative profile.';

COMMIT;
