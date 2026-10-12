BEGIN;

CREATE TABLE IF NOT EXISTS creative_mission_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  service_request_id UUID NOT NULL,
  mission_id UUID NOT NULL,
  creative_profile_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('accepted', 'in_progress', 'delivered', 'changes_requested', 'completed')
  ),
  delivery_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_note TEXT NULL,
  change_request_note TEXT NULL,
  last_idempotency_key UUID NOT NULL,
  updated_by_clerk_user_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NULL,
  delivered_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creative_mission_executions_workspace_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT creative_mission_executions_author_not_blank
    CHECK (NULLIF(btrim(updated_by_clerk_user_id), '') IS NOT NULL),
  CONSTRAINT creative_mission_executions_links_array_check
    CHECK (jsonb_typeof(delivery_links) = 'array'),
  CONSTRAINT creative_mission_executions_delivery_shape_check
    CHECK (
      status NOT IN ('delivered', 'changes_requested', 'completed')
      OR jsonb_array_length(delivery_links) > 0
      OR NULLIF(btrim(delivery_note), '') IS NOT NULL
    ),
  CONSTRAINT creative_mission_executions_note_limits_check
    CHECK (
      delivery_note IS NULL
      OR length(trim(delivery_note)) <= 2000
    ),
  CONSTRAINT creative_mission_executions_change_request_note_limits_check
    CHECK (
      change_request_note IS NULL
      OR length(trim(change_request_note)) <= 2000
    ),
  CONSTRAINT creative_mission_executions_change_request_requirement_check
    CHECK (
      status <> 'changes_requested'
      OR NULLIF(btrim(change_request_note), '') IS NOT NULL
    ),
  CONSTRAINT creative_mission_executions_timestamps_check
    CHECK (
      (
        status <> 'in_progress'
        OR started_at IS NOT NULL
      )
      AND (
        status NOT IN ('delivered', 'changes_requested', 'completed')
        OR (
          started_at IS NOT NULL
          AND delivered_at IS NOT NULL
        )
      )
      AND (
        status <> 'completed'
        OR (
          started_at IS NOT NULL
          AND delivered_at IS NOT NULL
          AND completed_at IS NOT NULL
        )
      )
      AND (
        delivered_at IS NULL
        OR started_at IS NULL
        OR delivered_at >= started_at
      )
      AND (
        completed_at IS NULL
        OR delivered_at IS NULL
        OR completed_at >= delivered_at
      )
    ),
  CONSTRAINT creative_mission_executions_request_workspace_fk
    FOREIGN KEY (workspace_id, service_request_id)
    REFERENCES athlete_service_requests (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_mission_executions_profile_workspace_fk
    FOREIGN KEY (workspace_id, creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_mission_executions_mission_workspace_fk
    FOREIGN KEY (workspace_id, service_request_id, mission_id)
    REFERENCES athlete_service_request_missions (workspace_id, service_request_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS creative_mission_executions_request_unique_idx
  ON creative_mission_executions (workspace_id, service_request_id);

CREATE UNIQUE INDEX IF NOT EXISTS creative_mission_executions_scope_unique_idx
  ON creative_mission_executions (
    workspace_id,
    service_request_id,
    mission_id,
    creative_profile_id
  );

CREATE INDEX IF NOT EXISTS creative_mission_executions_status_updated_idx
  ON creative_mission_executions (workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS creative_mission_execution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  service_request_id UUID NOT NULL,
  mission_id UUID NOT NULL,
  creative_profile_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (
    action IN ('started', 'delivered', 'changes_requested', 'completed')
  ),
  note TEXT NULL,
  delivery_links_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  authored_by_clerk_user_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creative_mission_execution_events_workspace_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT creative_mission_execution_events_author_not_blank
    CHECK (NULLIF(btrim(authored_by_clerk_user_id), '') IS NOT NULL),
  CONSTRAINT creative_mission_execution_events_fingerprint_not_blank
    CHECK (NULLIF(btrim(request_fingerprint), '') IS NOT NULL),
  CONSTRAINT creative_mission_execution_events_note_limits_check
    CHECK (
      note IS NULL
      OR length(trim(note)) <= 2000
    ),
  CONSTRAINT creative_mission_execution_events_links_array_check
    CHECK (jsonb_typeof(delivery_links_snapshot) = 'array'),
  CONSTRAINT creative_mission_execution_events_request_workspace_fk
    FOREIGN KEY (workspace_id, service_request_id)
    REFERENCES athlete_service_requests (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_mission_execution_events_profile_workspace_fk
    FOREIGN KEY (workspace_id, creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_mission_execution_events_mission_workspace_fk
    FOREIGN KEY (workspace_id, service_request_id, mission_id)
    REFERENCES athlete_service_request_missions (workspace_id, service_request_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_mission_execution_events_projection_fk
    FOREIGN KEY (workspace_id, service_request_id, mission_id, creative_profile_id)
    REFERENCES creative_mission_executions (workspace_id, service_request_id, mission_id, creative_profile_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS creative_mission_execution_events_idempotency_idx
  ON creative_mission_execution_events (
    workspace_id,
    service_request_id,
    creative_profile_id,
    idempotency_key
  );

CREATE INDEX IF NOT EXISTS creative_mission_execution_events_history_idx
  ON creative_mission_execution_events (
    workspace_id,
    service_request_id,
    created_at DESC,
    id DESC
  );

CREATE OR REPLACE FUNCTION prevent_creative_mission_execution_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'creative_mission_execution_events is immutable';
END;
$$;

DROP TRIGGER IF EXISTS creative_mission_execution_events_immutable
  ON creative_mission_execution_events;

CREATE TRIGGER creative_mission_execution_events_immutable
  BEFORE UPDATE OR DELETE ON creative_mission_execution_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_creative_mission_execution_event_mutation();

COMMENT ON TABLE creative_mission_executions IS
  'Projection 1:1 du suivi opérationnel d une mission créative, sans impact sur demande, crédit, achat ou réalisation.';

COMMENT ON TABLE creative_mission_execution_events IS
  'Historique append-only des démarrages, livraisons, demandes de modifications et validations.';

COMMIT;
