BEGIN;

ALTER TABLE partner_athlete_introduction_reports
  ADD COLUMN IF NOT EXISTS comment TEXT NULL;

CREATE TABLE IF NOT EXISTS partner_solicitation_control_events (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  can_solicit BOOLEAN NOT NULL,
  reason TEXT NOT NULL,
  actor_clerk_user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_solicitation_control_events_idempotency_unique
    UNIQUE (workspace_id, partner_id, idempotency_key),
  CHECK (NULLIF(btrim(reason), '') IS NOT NULL),
  CHECK (NULLIF(btrim(actor_clerk_user_id), '') IS NOT NULL),
  CHECK (NULLIF(btrim(idempotency_key), '') IS NOT NULL),
  CHECK (NULLIF(btrim(payload_hash), '') IS NOT NULL)
);

ALTER TABLE partner_athlete_introduction_events
  DROP CONSTRAINT IF EXISTS partner_athlete_introduction_events_event_type_check;

ALTER TABLE partner_athlete_introduction_events
  ADD CONSTRAINT partner_athlete_introduction_events_event_type_check
  CHECK (
    event_type IN (
      'request_created',
      'athlete_accepted',
      'athlete_declined',
      'moderation_suspended',
      'moderation_reactivated',
      'athlete_reported',
      'report_reviewing',
      'report_resolved',
      'report_dismissed'
    )
  );

COMMIT;
