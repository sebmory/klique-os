BEGIN;

ALTER TABLE sports_watch_candidates
  ADD COLUMN IF NOT EXISTS manual_entry_json JSONB NULL,
  ADD COLUMN IF NOT EXISTS created_by_clerk_user_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key UUID NULL,
  ADD CONSTRAINT sports_watch_candidates_manual_entry_check CHECK (
    source_key <> 'manual-entry'
    OR (
      manual_entry_json IS NOT NULL
      AND manual_entry_json->>'mode' = 'manual_entry'
      AND created_by_clerk_user_id IS NOT NULL
      AND btrim(created_by_clerk_user_id) <> ''
      AND idempotency_key IS NOT NULL
      AND factual_verification_status = 'unverified'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS sports_watch_candidates_manual_entry_idempotency_unique
  ON sports_watch_candidates (workspace_id, idempotency_key)
  WHERE source_key = 'manual-entry' AND idempotency_key IS NOT NULL;

ALTER TABLE sports_watch_candidate_events
  DROP CONSTRAINT IF EXISTS sports_watch_candidate_events_transition_check;

ALTER TABLE sports_watch_candidate_events
  ADD CONSTRAINT sports_watch_candidate_events_transition_check CHECK (
    (
      action = 'dismissed'
      AND from_status = 'validated'
      AND to_status = 'dismissed'
    )
    OR (
      action = 'restored'
      AND from_status = 'dismissed'
      AND to_status = 'validated'
    )
    OR (
      action = 'manual_created'
      AND from_status = to_status
      AND to_status IN ('pending', 'validated')
    )
  );

COMMIT;
