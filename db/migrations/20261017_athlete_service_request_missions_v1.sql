BEGIN;

CREATE TABLE IF NOT EXISTS athlete_service_request_missions (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  service_request_id UUID NOT NULL,
  reference_code TEXT NOT NULL,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  sport_discipline TEXT NOT NULL,
  mission_type TEXT NOT NULL CHECK (mission_type IN ('photo', 'video', 'photo_video')),
  mission_context TEXT NOT NULL CHECK (
    mission_context IN ('match', 'competition', 'training', 'posed_portraits', 'event', 'other')
  ),
  location_name TEXT NOT NULL,
  location_details TEXT NULL,
  mission_date DATE NOT NULL,
  start_time TIME WITHOUT TIME ZONE NULL,
  end_time TIME WITHOUT TIME ZONE NULL,
  delivery_due_date DATE NULL,
  deliverables TEXT NOT NULL,
  compensation_type TEXT NOT NULL CHECK (
    compensation_type IN ('unpaid_collaboration', 'expenses_only', 'paid_mandate', 'internal_klique')
  ),
  compensation_amount_chf_cents INTEGER NULL,
  expense_details TEXT NULL,
  internal_admin_notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'cancelled')),
  created_by_clerk_user_id TEXT NOT NULL,
  updated_by_clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT athlete_service_request_missions_workspace_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT athlete_service_request_missions_reference_not_blank
    CHECK (NULLIF(btrim(reference_code), '') IS NOT NULL),
  CONSTRAINT athlete_service_request_missions_required_text_check
    CHECK (
      NULLIF(btrim(title), '') IS NOT NULL
      AND NULLIF(btrim(brief), '') IS NOT NULL
      AND NULLIF(btrim(sport_discipline), '') IS NOT NULL
      AND NULLIF(btrim(location_name), '') IS NOT NULL
      AND NULLIF(btrim(deliverables), '') IS NOT NULL
    ),
  CONSTRAINT athlete_service_request_missions_time_order_check
    CHECK (
      end_time IS NULL
      OR (start_time IS NOT NULL AND end_time > start_time)
    ),
  CONSTRAINT athlete_service_request_missions_delivery_date_check
    CHECK (delivery_due_date IS NULL OR delivery_due_date >= mission_date),
  CONSTRAINT athlete_service_request_missions_compensation_check
    CHECK (
      (
        compensation_type = 'paid_mandate'
        AND compensation_amount_chf_cents IS NOT NULL
        AND compensation_amount_chf_cents > 0
      )
      OR
      (
        compensation_type <> 'paid_mandate'
        AND compensation_amount_chf_cents IS NULL
      )
    ),
  CONSTRAINT athlete_service_request_missions_author_check
    CHECK (
      NULLIF(btrim(created_by_clerk_user_id), '') IS NOT NULL
      AND NULLIF(btrim(updated_by_clerk_user_id), '') IS NOT NULL
    ),
  CONSTRAINT athlete_service_request_missions_dates_check
    CHECK (updated_at >= created_at),
  CONSTRAINT athlete_service_request_missions_request_workspace_fk
    FOREIGN KEY (workspace_id, service_request_id)
    REFERENCES athlete_service_requests (workspace_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_service_request_missions_workspace_request_idx
  ON athlete_service_request_missions (workspace_id, service_request_id);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_service_request_missions_workspace_reference_idx
  ON athlete_service_request_missions (workspace_id, reference_code);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_service_request_missions_workspace_request_id_idx
  ON athlete_service_request_missions (workspace_id, service_request_id, id);

CREATE INDEX IF NOT EXISTS athlete_service_request_missions_workspace_status_date_idx
  ON athlete_service_request_missions (workspace_id, status, mission_date, service_request_id);

CREATE TABLE IF NOT EXISTS athlete_service_request_mission_events (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  service_request_id UUID NOT NULL,
  mission_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'cancelled')),
  changed_fields TEXT[] NOT NULL,
  snapshot JSONB NOT NULL,
  request_fingerprint TEXT NOT NULL,
  idempotency_key UUID NOT NULL,
  authored_by_clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT athlete_service_request_mission_events_workspace_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT athlete_service_request_mission_events_changes_check
    CHECK (cardinality(changed_fields) > 0 AND jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT athlete_service_request_mission_events_fingerprint_not_blank
    CHECK (NULLIF(btrim(request_fingerprint), '') IS NOT NULL),
  CONSTRAINT athlete_service_request_mission_events_author_not_blank
    CHECK (NULLIF(btrim(authored_by_clerk_user_id), '') IS NOT NULL),
  CONSTRAINT athlete_service_request_mission_events_request_workspace_fk
    FOREIGN KEY (workspace_id, service_request_id)
    REFERENCES athlete_service_requests (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT athlete_service_request_mission_events_mission_workspace_fk
    FOREIGN KEY (workspace_id, service_request_id, mission_id)
    REFERENCES athlete_service_request_missions (workspace_id, service_request_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_service_request_mission_events_idempotency_idx
  ON athlete_service_request_mission_events (workspace_id, service_request_id, idempotency_key);

CREATE INDEX IF NOT EXISTS athlete_service_request_mission_events_history_idx
  ON athlete_service_request_mission_events (
    workspace_id,
    service_request_id,
    created_at DESC,
    id DESC
  );

CREATE OR REPLACE FUNCTION prevent_athlete_service_request_mission_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'athlete_service_request_mission_events is immutable';
END;
$$;

CREATE TRIGGER athlete_service_request_mission_events_immutable
  BEFORE UPDATE OR DELETE ON athlete_service_request_mission_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_athlete_service_request_mission_event_mutation();

COMMENT ON TABLE athlete_service_request_missions IS
  'Fiche éditoriale 1:1 d une demande de prestation Athlète. Aucun impact sur statut, quota, crédit ou achat.';

COMMENT ON COLUMN athlete_service_request_missions.mission_date IS
  'Date civile Europe/Zurich, stockée sans conversion de fuseau.';

COMMENT ON TABLE athlete_service_request_mission_events IS
  'Historique append-only des créations, modifications et annulations de fiches mission.';

COMMIT;
