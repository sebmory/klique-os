ALTER TABLE contact_requests
  ADD COLUMN IF NOT EXISTS request_kind TEXT NOT NULL DEFAULT 'athlete_contact',
  ADD COLUMN IF NOT EXISTS partner_id TEXT NULL;

ALTER TABLE contact_requests
  DROP CONSTRAINT IF EXISTS contact_requests_status_check,
  DROP CONSTRAINT IF EXISTS contact_requests_message_check,
  DROP CONSTRAINT IF EXISTS contact_requests_request_kind_check,
  DROP CONSTRAINT IF EXISTS contact_requests_partner_identity_check;

ALTER TABLE contact_requests
  ADD CONSTRAINT contact_requests_status_check
    CHECK (status IN ('open', 'pending', 'in_progress', 'resolved')),
  ADD CONSTRAINT contact_requests_message_check
    CHECK (
      char_length(message) <= 3000
      AND (request_kind = 'partner_athlete_introduction' OR char_length(message) >= 1)
    ),
  ADD CONSTRAINT contact_requests_request_kind_check
    CHECK (request_kind IN ('athlete_contact', 'partner_athlete_introduction')),
  ADD CONSTRAINT contact_requests_partner_identity_check
    CHECK (
      (request_kind = 'athlete_contact' AND partner_id IS NULL)
      OR (request_kind = 'partner_athlete_introduction' AND partner_id IS NOT NULL)
    );

CREATE UNIQUE INDEX IF NOT EXISTS contact_requests_pending_partner_athlete_unique
  ON contact_requests (workspace_id, partner_id, athlete_id)
  WHERE request_kind = 'partner_athlete_introduction' AND status = 'pending';

CREATE INDEX IF NOT EXISTS contact_requests_workspace_partner_idx
  ON contact_requests (workspace_id, partner_id)
  WHERE partner_id IS NOT NULL;