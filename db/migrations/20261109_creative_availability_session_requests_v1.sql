BEGIN;

CREATE TABLE IF NOT EXISTS creative_availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  creative_profile_id UUID NOT NULL,
  availability_date DATE NOT NULL,
  start_time TIME WITHOUT TIME ZONE NULL,
  end_time TIME WITHOUT TIME ZONE NULL,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'weekly')),
  recurrence_until DATE NULL,
  regions TEXT[] NOT NULL,
  mission_types TEXT[] NOT NULL,
  internal_comment TEXT NULL,
  planning_timezone TEXT NOT NULL DEFAULT 'Europe/Zurich'
    CHECK (planning_timezone = 'Europe/Zurich'),
  created_by_clerk_user_id TEXT NOT NULL,
  updated_by_clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creative_availability_rules_profile_workspace_fk
    FOREIGN KEY (workspace_id, creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_availability_rules_time_shape_check CHECK (
    (all_day AND start_time IS NULL AND end_time IS NULL)
    OR
    (NOT all_day AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  ),
  CONSTRAINT creative_availability_rules_recurrence_bounds_check CHECK (
    (recurrence = 'none' AND recurrence_until IS NULL)
    OR
    (
      recurrence = 'weekly'
      AND recurrence_until IS NOT NULL
      AND recurrence_until >= availability_date
      AND recurrence_until <= availability_date + 366
    )
  ),
  CONSTRAINT creative_availability_rules_regions_check CHECK (
    cardinality(regions) BETWEEN 1 AND 20
  ),
  CONSTRAINT creative_availability_rules_mission_types_check CHECK (
    cardinality(mission_types) BETWEEN 1 AND 2
    AND mission_types <@ ARRAY['match_competition', 'media_day']::TEXT[]
  ),
  CONSTRAINT creative_availability_rules_comment_check CHECK (
    char_length(COALESCE(internal_comment, '')) <= 1000
  ),
  CONSTRAINT creative_availability_rules_authors_check CHECK (
    NULLIF(btrim(created_by_clerk_user_id), '') IS NOT NULL
    AND NULLIF(btrim(updated_by_clerk_user_id), '') IS NOT NULL
  ),
  CONSTRAINT creative_availability_rules_dates_check CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS creative_availability_rules_workspace_id_idx
  ON creative_availability_rules (workspace_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS creative_availability_rules_exact_unique_idx
  ON creative_availability_rules (
    workspace_id,
    creative_profile_id,
    availability_date,
    start_time,
    end_time,
    all_day,
    recurrence,
    recurrence_until,
    regions,
    mission_types
  ) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS creative_availability_rules_calendar_idx
  ON creative_availability_rules (
    workspace_id,
    creative_profile_id,
    availability_date,
    recurrence_until
  );

CREATE TABLE IF NOT EXISTS creative_availability_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  availability_rule_id UUID NOT NULL,
  exception_date DATE NOT NULL,
  created_by_clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creative_availability_exceptions_rule_workspace_fk
    FOREIGN KEY (workspace_id, availability_rule_id)
    REFERENCES creative_availability_rules (workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT creative_availability_exceptions_author_check CHECK (
    NULLIF(btrim(created_by_clerk_user_id), '') IS NOT NULL
  ),
  UNIQUE (workspace_id, availability_rule_id, exception_date)
);

CREATE TABLE IF NOT EXISTS athlete_session_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  athlete_clerk_user_id TEXT NOT NULL,
  submission_idempotency_key UUID NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('match_competition', 'media_day')),
  workflow_status TEXT NOT NULL DEFAULT 'submitted' CHECK (
    workflow_status IN (
      'draft',
      'submitted',
      'admin_review',
      'accepted',
      'refused',
      'changes_requested',
      'production_linked',
      'proposed_to_creatives',
      'candidate_received',
      'assigned',
      'creative_agreed',
      'confirmed',
      'completed',
      'cancelled'
    )
  ),
  sport TEXT NULL,
  event_type TEXT NULL,
  event_starts_at TIMESTAMPTZ NULL,
  event_ends_at TIMESTAMPTZ NULL,
  schedule_to_confirm BOOLEAN NOT NULL DEFAULT FALSE,
  location_name TEXT NULL,
  region TEXT NOT NULL,
  club_or_team TEXT NULL,
  opponent_or_event TEXT NULL,
  objective TEXT NOT NULL,
  deliverables TEXT NOT NULL,
  practical_information TEXT NULL,
  desired_duration_minutes INTEGER NULL,
  constraints_comment TEXT NULL,
  product_code TEXT NULL REFERENCES athlete_service_products (code) ON DELETE RESTRICT,
  commercial_mode TEXT NOT NULL CHECK (
    commercial_mode IN ('included_right', 'paid_extra', 'admin_decision')
  ),
  snapshot_credit_type TEXT NULL CHECK (
    snapshot_credit_type IN ('production', 'custom_content')
  ),
  snapshot_credit_quantity INTEGER NULL CHECK (snapshot_credit_quantity > 0),
  snapshot_price_chf NUMERIC(10, 2) NULL CHECK (snapshot_price_chf >= 0),
  admin_reason TEXT NULL,
  athlete_complement TEXT NULL,
  production_brief_id UUID NULL,
  final_confirmed_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT athlete_session_requests_identity_check CHECK (
    NULLIF(btrim(workspace_id), '') IS NOT NULL
    AND NULLIF(btrim(athlete_id), '') IS NOT NULL
    AND NULLIF(btrim(athlete_clerk_user_id), '') IS NOT NULL
  ),
  CONSTRAINT athlete_session_requests_required_text_check CHECK (
    NULLIF(btrim(region), '') IS NOT NULL
    AND NULLIF(btrim(objective), '') IS NOT NULL
    AND NULLIF(btrim(deliverables), '') IS NOT NULL
  ),
  CONSTRAINT athlete_session_requests_match_shape_check CHECK (
    request_type <> 'match_competition'
    OR (
      NULLIF(btrim(sport), '') IS NOT NULL
      AND NULLIF(btrim(event_type), '') IS NOT NULL
      AND event_starts_at IS NOT NULL
      AND event_ends_at IS NOT NULL
      AND event_ends_at > event_starts_at
      AND desired_duration_minutes IS NULL
    )
  ),
  CONSTRAINT athlete_session_requests_media_day_shape_check CHECK (
    request_type <> 'media_day'
    OR (
      event_starts_at IS NULL
      AND event_ends_at IS NULL
      AND desired_duration_minutes IS NOT NULL
      AND desired_duration_minutes BETWEEN 30 AND 720
    )
  ),
  CONSTRAINT athlete_session_requests_commercial_shape_check CHECK (
    (
      commercial_mode = 'included_right'
      AND product_code IS NOT NULL
      AND snapshot_credit_type IS NOT NULL
      AND snapshot_credit_quantity IS NOT NULL
      AND snapshot_price_chf IS NULL
    )
    OR
    (
      commercial_mode = 'paid_extra'
      AND product_code IS NOT NULL
      AND snapshot_credit_type IS NULL
      AND snapshot_credit_quantity IS NULL
      AND snapshot_price_chf IS NOT NULL
    )
    OR
    (
      commercial_mode = 'admin_decision'
      AND snapshot_credit_type IS NULL
      AND snapshot_credit_quantity IS NULL
      AND snapshot_price_chf IS NULL
    )
  ),
  CONSTRAINT athlete_session_requests_reason_check CHECK (
    char_length(COALESCE(admin_reason, '')) <= 2000
    AND char_length(COALESCE(athlete_complement, '')) <= 2000
  ),
  CONSTRAINT athlete_session_requests_confirmation_check CHECK (
    (workflow_status IN ('confirmed', 'completed')) = (final_confirmed_at IS NOT NULL)
  ),
  CONSTRAINT athlete_session_requests_cancellation_check CHECK (
    (workflow_status = 'cancelled') = (cancelled_at IS NOT NULL)
  ),
  CONSTRAINT athlete_session_requests_dates_check CHECK (updated_at >= created_at),
  CONSTRAINT athlete_session_requests_production_workspace_fk
    FOREIGN KEY (workspace_id, production_brief_id)
    REFERENCES production_creative_briefs (workspace_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_session_requests_workspace_id_idx
  ON athlete_session_requests (workspace_id, id);

CREATE INDEX IF NOT EXISTS athlete_session_requests_athlete_history_idx
  ON athlete_session_requests (
    workspace_id,
    athlete_id,
    athlete_clerk_user_id,
    created_at DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS athlete_session_requests_submission_idempotency_idx
  ON athlete_session_requests (
    workspace_id,
    athlete_clerk_user_id,
    submission_idempotency_key
  );

CREATE INDEX IF NOT EXISTS athlete_session_requests_admin_queue_idx
  ON athlete_session_requests (workspace_id, workflow_status, request_type, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_session_requests_production_brief_unique_idx
  ON athlete_session_requests (workspace_id, production_brief_id)
  WHERE production_brief_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS athlete_session_request_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  request_id UUID NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  planning_timezone TEXT NOT NULL DEFAULT 'Europe/Zurich'
    CHECK (planning_timezone = 'Europe/Zurich'),
  preference_order INTEGER NOT NULL CHECK (preference_order BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT athlete_session_request_periods_request_workspace_fk
    FOREIGN KEY (workspace_id, request_id)
    REFERENCES athlete_session_requests (workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT athlete_session_request_periods_order_check CHECK (ends_at > starts_at),
  UNIQUE (workspace_id, request_id, preference_order),
  UNIQUE (workspace_id, request_id, starts_at, ends_at)
);

CREATE TABLE IF NOT EXISTS athlete_session_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  request_id UUID NOT NULL,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_clerk_user_id TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('athlete', 'admin', 'creative', 'system')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT athlete_session_request_events_request_workspace_fk
    FOREIGN KEY (workspace_id, request_id)
    REFERENCES athlete_session_requests (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT athlete_session_request_events_details_check CHECK (jsonb_typeof(details) = 'object'),
  CONSTRAINT athlete_session_request_events_text_check CHECK (
    NULLIF(btrim(action), '') IS NOT NULL
    AND NULLIF(btrim(actor_clerk_user_id), '') IS NOT NULL
    AND NULLIF(btrim(idempotency_key), '') IS NOT NULL
  ),
  UNIQUE (workspace_id, request_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS athlete_session_request_events_history_idx
  ON athlete_session_request_events (workspace_id, request_id, created_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS athlete_session_confirmed_creative_slots (
  workspace_id TEXT NOT NULL,
  creative_profile_id UUID NOT NULL,
  mission_date DATE NOT NULL,
  request_id UUID NOT NULL,
  brief_id UUID NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, creative_profile_id, mission_date),
  UNIQUE (workspace_id, request_id),
  CONSTRAINT athlete_session_confirmed_slots_request_workspace_fk
    FOREIGN KEY (workspace_id, request_id)
    REFERENCES athlete_session_requests (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT athlete_session_confirmed_slots_brief_workspace_fk
    FOREIGN KEY (workspace_id, brief_id)
    REFERENCES production_creative_briefs (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT athlete_session_confirmed_slots_creative_workspace_fk
    FOREIGN KEY (workspace_id, creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS production_creative_briefs_athlete_origin_unique_idx
  ON production_creative_briefs (workspace_id, origin_type, origin_request_id)
  WHERE origin_type = 'athlete_session_request' AND origin_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_athlete_session_request_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'athlete_session_request_events is immutable';
END;
$$;

DROP TRIGGER IF EXISTS athlete_session_request_events_immutable
  ON athlete_session_request_events;

CREATE TRIGGER athlete_session_request_events_immutable
  BEFORE UPDATE OR DELETE ON athlete_session_request_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_athlete_session_request_event_mutation();

COMMENT ON TABLE creative_availability_rules IS
  'Disponibilités déclaratives Europe/Zurich. Une disponibilité ne réserve ni n attribue une mission.';
COMMENT ON TABLE creative_availability_exceptions IS
  'Dates exclues d une disponibilité ponctuelle ou récurrente.';
COMMENT ON TABLE athlete_session_requests IS
  'Demandes structurées Athlète soumises à acceptation Admin avant rattachement explicite au parcours Production.';
COMMENT ON TABLE athlete_session_request_events IS
  'Journal append-only et idempotent des transitions de demandes de séances.';
COMMENT ON TABLE athlete_session_confirmed_creative_slots IS
  'Verrou persistant garantissant une seule confirmation finale par créatif et date.';
COMMENT ON COLUMN athlete_session_requests.commercial_mode IS
  'Snapshot informatif du droit ou coût existant; aucune consommation, gratuité ou paiement n est déclenché.';
COMMENT ON COLUMN athlete_session_requests.production_brief_id IS
  'Identité UUID stable du brief Production; aucun numéro de ligne Sheets ne participe à la relation.';

COMMIT;
