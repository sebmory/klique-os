BEGIN;

ALTER TABLE sports_watch_candidates
  DROP CONSTRAINT IF EXISTS sports_watch_candidates_admin_status_check;

ALTER TABLE sports_watch_candidates
  ADD COLUMN IF NOT EXISTS dismissed_by_clerk_user_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ NULL,
  ADD CONSTRAINT sports_watch_candidates_admin_status_check CHECK (
    admin_status IN ('pending', 'validated', 'exploited', 'rejected', 'dismissed')
  ),
  ADD CONSTRAINT sports_watch_candidates_dismissal_check CHECK (
    admin_status <> 'dismissed'
    OR (
      dismissed_by_clerk_user_id IS NOT NULL
      AND btrim(dismissed_by_clerk_user_id) <> ''
      AND dismissed_at IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS sports_watch_candidates_workspace_id_unique
  ON sports_watch_candidates (workspace_id, id);

CREATE TABLE IF NOT EXISTS sports_watch_candidate_events (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  candidate_id UUID NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor_clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sports_watch_candidate_events_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_candidate_events_actor_check CHECK (btrim(actor_clerk_user_id) <> ''),
  CONSTRAINT sports_watch_candidate_events_transition_check CHECK (
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
  ),
  CONSTRAINT sports_watch_candidate_events_candidate_fk
    FOREIGN KEY (workspace_id, candidate_id)
    REFERENCES sports_watch_candidates (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS sports_watch_candidate_events_candidate_created_idx
  ON sports_watch_candidate_events (workspace_id, candidate_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_sports_watch_candidate_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'sports_watch_candidate_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS sports_watch_candidate_events_append_only
  ON sports_watch_candidate_events;

CREATE TRIGGER sports_watch_candidate_events_append_only
BEFORE UPDATE OR DELETE ON sports_watch_candidate_events
FOR EACH ROW
EXECUTE FUNCTION prevent_sports_watch_candidate_event_mutation();

COMMIT;
