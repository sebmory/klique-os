BEGIN;

ALTER TABLE athlete_service_requests
  ADD COLUMN IF NOT EXISTS assigned_creative_profile_id UUID NULL;

CREATE UNIQUE INDEX IF NOT EXISTS athlete_service_requests_workspace_id_unique_idx
  ON athlete_service_requests (workspace_id, id);

ALTER TABLE athlete_service_requests
  ADD CONSTRAINT athlete_service_requests_assigned_creative_workspace_fk
  FOREIGN KEY (workspace_id, assigned_creative_profile_id)
  REFERENCES creative_profiles (workspace_id, id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS athlete_service_requests_workspace_assigned_creative_idx
  ON athlete_service_requests (workspace_id, assigned_creative_profile_id, requested_at DESC)
  WHERE assigned_creative_profile_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS athlete_service_request_creative_assignment_events (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  service_request_id UUID NOT NULL,
  previous_creative_profile_id UUID NULL,
  creative_profile_id UUID NULL,
  action TEXT NOT NULL CHECK (action IN ('assigned', 'replaced', 'unassigned')),
  idempotency_key UUID NOT NULL,
  authored_by_clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT athlete_service_request_assignment_events_workspace_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT athlete_service_request_assignment_events_author_not_blank
    CHECK (NULLIF(btrim(authored_by_clerk_user_id), '') IS NOT NULL),
  CONSTRAINT athlete_service_request_assignment_events_action_shape_check
    CHECK (
      (action = 'assigned' AND previous_creative_profile_id IS NULL AND creative_profile_id IS NOT NULL)
      OR
      (action = 'replaced' AND previous_creative_profile_id IS NOT NULL AND creative_profile_id IS NOT NULL
        AND previous_creative_profile_id <> creative_profile_id)
      OR
      (action = 'unassigned' AND previous_creative_profile_id IS NOT NULL AND creative_profile_id IS NULL)
    ),
  CONSTRAINT athlete_service_request_assignment_events_request_workspace_fk
    FOREIGN KEY (workspace_id, service_request_id)
    REFERENCES athlete_service_requests (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT athlete_service_request_assignment_events_previous_creative_workspace_fk
    FOREIGN KEY (workspace_id, previous_creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT athlete_service_request_assignment_events_creative_workspace_fk
    FOREIGN KEY (workspace_id, creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_service_request_assignment_events_idempotency_idx
  ON athlete_service_request_creative_assignment_events (
    workspace_id,
    service_request_id,
    idempotency_key
  );

CREATE INDEX IF NOT EXISTS athlete_service_request_assignment_events_history_idx
  ON athlete_service_request_creative_assignment_events (
    workspace_id,
    service_request_id,
    created_at DESC,
    id DESC
  );

CREATE OR REPLACE FUNCTION prevent_athlete_service_request_assignment_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'athlete_service_request_creative_assignment_events is immutable';
END;
$$;

DROP TRIGGER IF EXISTS athlete_service_request_assignment_events_immutable
  ON athlete_service_request_creative_assignment_events;

CREATE TRIGGER athlete_service_request_assignment_events_immutable
  BEFORE UPDATE OR DELETE ON athlete_service_request_creative_assignment_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_athlete_service_request_assignment_event_mutation();

COMMENT ON COLUMN athlete_service_requests.assigned_creative_profile_id IS
  'Affectation opérationnelle courante, limitée au même workspace. Ne modifie ni statut, ni quota, ni consommation.';

COMMENT ON TABLE athlete_service_request_creative_assignment_events IS
  'Historique append-only des affectations de créatifs aux demandes de prestation Athlète.';

COMMIT;
