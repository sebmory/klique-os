BEGIN;

CREATE TABLE IF NOT EXISTS creative_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  record_kind TEXT NOT NULL DEFAULT 'mission'
    CHECK (record_kind IN ('mission', 'historical_entry')),
  business_state TEXT NOT NULL CHECK (
    business_state IN (
      'review',
      'organize',
      'proposed',
      'confirmed',
      'in_progress',
      'review_delivery',
      'completed',
      'closed_without_action'
    )
  ),
  title TEXT NOT NULL,
  mission_type TEXT NOT NULL CHECK (
    mission_type IN ('media_day', 'match_competition', 'production', 'other')
  ),
  scheduled_at TIMESTAMPTZ NULL,
  occurred_at TIMESTAMPTZ NULL,
  occurred_at_source TEXT NULL,
  regularization_status TEXT NOT NULL DEFAULT 'none' CHECK (
    regularization_status IN (
      'none',
      'historical_completed',
      'historical_closed_without_action'
    )
  ),
  regularization_key TEXT NULL,
  regularization_note TEXT NULL,
  historical_creative_name TEXT NULL,
  historical_creative_profile_id UUID NULL,
  operational_creative_profile_id UUID NULL,
  created_by_actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creative_missions_workspace_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT creative_missions_title_not_blank
    CHECK (NULLIF(btrim(title), '') IS NOT NULL),
  CONSTRAINT creative_missions_actor_not_blank
    CHECK (NULLIF(btrim(created_by_actor), '') IS NOT NULL),
  CONSTRAINT creative_missions_occurred_source_check CHECK (
    (occurred_at IS NULL AND occurred_at_source IS NULL)
    OR (
      occurred_at IS NOT NULL
      AND NULLIF(btrim(occurred_at_source), '') IS NOT NULL
    )
  ),
  CONSTRAINT creative_missions_regularization_shape_check CHECK (
    (
      regularization_status = 'none'
      AND regularization_key IS NULL
      AND regularization_note IS NULL
      AND record_kind = 'mission'
    )
    OR (
      regularization_status = 'historical_completed'
      AND record_kind = 'mission'
      AND business_state = 'completed'
      AND occurred_at IS NOT NULL
      AND NULLIF(btrim(regularization_key), '') IS NOT NULL
      AND NULLIF(btrim(regularization_note), '') IS NOT NULL
    )
    OR (
      regularization_status = 'historical_closed_without_action'
      AND record_kind = 'historical_entry'
      AND business_state = 'closed_without_action'
      AND NULLIF(btrim(regularization_key), '') IS NOT NULL
      AND NULLIF(btrim(regularization_note), '') IS NOT NULL
    )
  ),
  CONSTRAINT creative_missions_historical_creative_check CHECK (
    (
      historical_creative_name IS NULL
      AND historical_creative_profile_id IS NULL
    )
    OR (
      regularization_status <> 'none'
      AND NULLIF(btrim(historical_creative_name), '') IS NOT NULL
    )
  ),
  CONSTRAINT creative_missions_dates_check
    CHECK (updated_at >= created_at),
  CONSTRAINT creative_missions_historical_profile_workspace_fk
    FOREIGN KEY (workspace_id, historical_creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_missions_operational_profile_workspace_fk
    FOREIGN KEY (workspace_id, operational_creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS creative_missions_workspace_id_idx
  ON creative_missions (workspace_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS creative_missions_regularization_key_unique_idx
  ON creative_missions (workspace_id, regularization_key)
  WHERE regularization_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS creative_missions_workspace_state_idx
  ON creative_missions (workspace_id, business_state, occurred_at DESC, scheduled_at DESC, id);

CREATE TABLE IF NOT EXISTS creative_mission_athletes (
  workspace_id TEXT NOT NULL,
  mission_id UUID NOT NULL,
  athlete_id TEXT NOT NULL,
  athlete_name_snapshot TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, mission_id, athlete_id),
  CONSTRAINT creative_mission_athletes_identity_check CHECK (
    NULLIF(btrim(athlete_id), '') IS NOT NULL
    AND (
      athlete_name_snapshot IS NULL
      OR NULLIF(btrim(athlete_name_snapshot), '') IS NOT NULL
    )
  ),
  CONSTRAINT creative_mission_athletes_mission_workspace_fk
    FOREIGN KEY (workspace_id, mission_id)
    REFERENCES creative_missions (workspace_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS creative_mission_athletes_workspace_athlete_idx
  ON creative_mission_athletes (workspace_id, athlete_id, mission_id);

CREATE TABLE IF NOT EXISTS creative_mission_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  mission_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (
    source_type IN (
      'athlete_service_request',
      'athlete_session_request',
      'production_brief',
      'production_sheet'
    )
  ),
  relation_type TEXT NOT NULL CHECK (
    relation_type IN ('origin', 'service', 'production')
  ),
  source_id TEXT NOT NULL,
  athlete_service_request_id UUID NULL,
  athlete_session_request_id UUID NULL,
  production_brief_id UUID NULL,
  production_source TEXT NULL,
  production_source_row INTEGER NULL,
  production_source_fingerprint TEXT NULL,
  source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creative_mission_links_identity_check CHECK (
    NULLIF(btrim(workspace_id), '') IS NOT NULL
    AND NULLIF(btrim(source_id), '') IS NOT NULL
    AND jsonb_typeof(source_snapshot) = 'object'
  ),
  CONSTRAINT creative_mission_links_source_shape_check CHECK (
    (
      source_type = 'athlete_service_request'
      AND relation_type IN ('origin', 'service')
      AND athlete_service_request_id IS NOT NULL
      AND athlete_session_request_id IS NULL
      AND production_brief_id IS NULL
      AND production_source IS NULL
      AND production_source_row IS NULL
      AND production_source_fingerprint IS NULL
      AND source_id = athlete_service_request_id::text
    )
    OR (
      source_type = 'athlete_session_request'
      AND relation_type = 'origin'
      AND athlete_service_request_id IS NULL
      AND athlete_session_request_id IS NOT NULL
      AND production_brief_id IS NULL
      AND production_source IS NULL
      AND production_source_row IS NULL
      AND production_source_fingerprint IS NULL
      AND source_id = athlete_session_request_id::text
    )
    OR (
      source_type = 'production_brief'
      AND relation_type = 'production'
      AND athlete_service_request_id IS NULL
      AND athlete_session_request_id IS NULL
      AND production_brief_id IS NOT NULL
      AND production_source IS NULL
      AND production_source_row IS NULL
      AND production_source_fingerprint IS NULL
      AND source_id = production_brief_id::text
    )
    OR (
      source_type = 'production_sheet'
      AND relation_type = 'production'
      AND athlete_service_request_id IS NULL
      AND athlete_session_request_id IS NULL
      AND production_brief_id IS NULL
      AND NULLIF(btrim(production_source), '') IS NOT NULL
      AND production_source_row IS NOT NULL
      AND production_source_row > 0
      AND production_source_fingerprint ~ '^[0-9a-f]{64}$'
      AND source_id = production_source || ':' || production_source_fingerprint
    )
  ),
  CONSTRAINT creative_mission_links_mission_workspace_fk
    FOREIGN KEY (workspace_id, mission_id)
    REFERENCES creative_missions (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_mission_links_service_request_workspace_fk
    FOREIGN KEY (workspace_id, athlete_service_request_id)
    REFERENCES athlete_service_requests (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_mission_links_session_request_workspace_fk
    FOREIGN KEY (workspace_id, athlete_session_request_id)
    REFERENCES athlete_session_requests (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_mission_links_production_brief_workspace_fk
    FOREIGN KEY (workspace_id, production_brief_id)
    REFERENCES production_creative_briefs (workspace_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS creative_mission_links_workspace_id_idx
  ON creative_mission_links (workspace_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS creative_mission_links_source_unique_idx
  ON creative_mission_links (workspace_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS creative_mission_links_mission_idx
  ON creative_mission_links (workspace_id, mission_id, source_type, created_at);

CREATE TABLE IF NOT EXISTS creative_mission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  mission_id UUID NOT NULL,
  action TEXT NOT NULL,
  from_state TEXT NULL,
  to_state TEXT NOT NULL CHECK (
    to_state IN (
      'review',
      'organize',
      'proposed',
      'confirmed',
      'in_progress',
      'review_delivery',
      'completed',
      'closed_without_action'
    )
  ),
  actor TEXT NOT NULL,
  note TEXT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creative_mission_events_text_check CHECK (
    NULLIF(btrim(action), '') IS NOT NULL
    AND NULLIF(btrim(actor), '') IS NOT NULL
    AND NULLIF(btrim(idempotency_key), '') IS NOT NULL
    AND (note IS NULL OR NULLIF(btrim(note), '') IS NOT NULL)
    AND jsonb_typeof(details) = 'object'
  ),
  CONSTRAINT creative_mission_events_from_state_check CHECK (
    from_state IS NULL
    OR from_state IN (
      'review',
      'organize',
      'proposed',
      'confirmed',
      'in_progress',
      'review_delivery',
      'completed',
      'closed_without_action'
    )
  ),
  CONSTRAINT creative_mission_events_mission_workspace_fk
    FOREIGN KEY (workspace_id, mission_id)
    REFERENCES creative_missions (workspace_id, id)
    ON DELETE RESTRICT,
  UNIQUE (workspace_id, mission_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS creative_mission_events_history_idx
  ON creative_mission_events (workspace_id, mission_id, created_at ASC, id ASC);

CREATE OR REPLACE FUNCTION prevent_canonical_creative_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS creative_mission_links_immutable
  ON creative_mission_links;
CREATE TRIGGER creative_mission_links_immutable
  BEFORE UPDATE OR DELETE ON creative_mission_links
  FOR EACH ROW
  EXECUTE FUNCTION prevent_canonical_creative_history_mutation();

DROP TRIGGER IF EXISTS creative_mission_events_immutable
  ON creative_mission_events;
CREATE TRIGGER creative_mission_events_immutable
  BEFORE UPDATE OR DELETE ON creative_mission_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_canonical_creative_history_mutation();

CREATE OR REPLACE FUNCTION canonical_creative_state_from_session(
  source_status TEXT
) RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE source_status
    WHEN 'draft' THEN 'review'
    WHEN 'submitted' THEN 'review'
    WHEN 'admin_review' THEN 'review'
    WHEN 'changes_requested' THEN 'review'
    WHEN 'accepted' THEN 'organize'
    WHEN 'production_linked' THEN 'organize'
    WHEN 'proposed_to_creatives' THEN 'proposed'
    WHEN 'candidate_received' THEN 'proposed'
    WHEN 'assigned' THEN 'proposed'
    WHEN 'creative_agreed' THEN 'proposed'
    WHEN 'confirmed' THEN 'confirmed'
    WHEN 'completed' THEN 'completed'
    WHEN 'refused' THEN 'closed_without_action'
    WHEN 'cancelled' THEN 'closed_without_action'
    ELSE 'review'
  END;
$$;

CREATE OR REPLACE FUNCTION canonical_creative_state_from_brief(
  source_status TEXT
) RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE source_status
    WHEN 'draft' THEN 'organize'
    WHEN 'published' THEN 'proposed'
    WHEN 'assigned' THEN 'proposed'
    WHEN 'cancelled' THEN 'closed_without_action'
    ELSE 'organize'
  END;
$$;

CREATE OR REPLACE FUNCTION sync_canonical_creative_session_request()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_mission_id UUID;
  previous_state TEXT;
  next_state TEXT;
  target_title TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.workspace_id || ':athlete_session_request:' || NEW.id::text, 0)
  );

  SELECT link.mission_id
  INTO target_mission_id
  FROM creative_mission_links link
  WHERE link.workspace_id = NEW.workspace_id
    AND link.source_type = 'athlete_session_request'
    AND link.source_id = NEW.id::text;

  next_state := canonical_creative_state_from_session(NEW.workflow_status);
  target_title := CASE NEW.request_type
    WHEN 'media_day' THEN 'Media Day — ' || NEW.athlete_id
    ELSE COALESCE(
      NULLIF(btrim(NEW.opponent_or_event), ''),
      NULLIF(btrim(NEW.event_type), ''),
      'Photos en match — ' || NEW.athlete_id
    )
  END;

  IF target_mission_id IS NULL THEN
    INSERT INTO creative_missions (
      workspace_id, business_state, title, mission_type, scheduled_at,
      regularization_status, operational_creative_profile_id, created_by_actor
    ) VALUES (
      NEW.workspace_id,
      next_state,
      target_title,
      NEW.request_type,
      NEW.event_starts_at,
      'none',
      NULL,
      'projection:athlete_session_request'
    )
    RETURNING id INTO target_mission_id;

    INSERT INTO creative_mission_links (
      workspace_id, mission_id, source_type, relation_type, source_id,
      athlete_session_request_id, source_snapshot
    ) VALUES (
      NEW.workspace_id,
      target_mission_id,
      'athlete_session_request',
      'origin',
      NEW.id::text,
      NEW.id,
      jsonb_build_object(
        'requestType', NEW.request_type,
        'workflowStatus', NEW.workflow_status,
        'objective', NEW.objective,
        'deliverables', NEW.deliverables
      )
    );

    previous_state := NULL;
  ELSE
    SELECT business_state
    INTO previous_state
    FROM creative_missions
    WHERE workspace_id = NEW.workspace_id
      AND id = target_mission_id
    FOR UPDATE;

    UPDATE creative_missions
    SET business_state = next_state,
        title = target_title,
        mission_type = NEW.request_type,
        scheduled_at = COALESCE(NEW.event_starts_at, scheduled_at),
        updated_at = NOW()
    WHERE workspace_id = NEW.workspace_id
      AND id = target_mission_id
      AND regularization_status = 'none';
  END IF;

  INSERT INTO creative_mission_athletes (
    workspace_id, mission_id, athlete_id
  ) VALUES (
    NEW.workspace_id, target_mission_id, NEW.athlete_id
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO creative_mission_events (
    workspace_id, mission_id, action, from_state, to_state,
    actor, details, idempotency_key
  ) VALUES (
    NEW.workspace_id,
    target_mission_id,
    'session_projection_updated',
    previous_state,
    next_state,
    'projection:athlete_session_request',
    jsonb_build_object(
      'requestId', NEW.id,
      'workflowStatus', NEW.workflow_status
    ),
    'session:' || NEW.id::text || ':' || NEW.workflow_status || ':' || NEW.updated_at::text
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS athlete_session_requests_canonical_projection
  ON athlete_session_requests;
CREATE TRIGGER athlete_session_requests_canonical_projection
  AFTER INSERT OR UPDATE OF
    workflow_status,
    request_type,
    event_starts_at,
    opponent_or_event,
    event_type,
    objective,
    deliverables,
    production_brief_id,
    updated_at
  ON athlete_session_requests
  FOR EACH ROW
  EXECUTE FUNCTION sync_canonical_creative_session_request();

CREATE OR REPLACE FUNCTION refresh_canonical_creative_session_schedule()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_workspace_id TEXT;
  target_request_id UUID;
BEGIN
  target_workspace_id := COALESCE(NEW.workspace_id, OLD.workspace_id);
  target_request_id := COALESCE(NEW.request_id, OLD.request_id);

  UPDATE creative_missions mission
  SET scheduled_at = periods.first_start,
      updated_at = NOW()
  FROM creative_mission_links link
  CROSS JOIN LATERAL (
    SELECT MIN(period.starts_at) AS first_start
    FROM athlete_session_request_periods period
    WHERE period.workspace_id = target_workspace_id
      AND period.request_id = target_request_id
  ) periods
  WHERE link.workspace_id = target_workspace_id
    AND link.source_type = 'athlete_session_request'
    AND link.source_id = target_request_id::text
    AND mission.workspace_id = link.workspace_id
    AND mission.id = link.mission_id
    AND mission.regularization_status = 'none';

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS athlete_session_request_periods_canonical_projection
  ON athlete_session_request_periods;
CREATE TRIGGER athlete_session_request_periods_canonical_projection
  AFTER INSERT OR UPDATE OR DELETE ON athlete_session_request_periods
  FOR EACH ROW
  EXECUTE FUNCTION refresh_canonical_creative_session_schedule();

CREATE OR REPLACE FUNCTION sync_canonical_creative_production_brief()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_mission_id UUID;
  previous_state TEXT;
  next_state TEXT;
  athlete JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.workspace_id || ':production_brief:' || NEW.id::text, 0)
  );

  SELECT link.mission_id
  INTO target_mission_id
  FROM creative_mission_links link
  WHERE link.workspace_id = NEW.workspace_id
    AND (
      (
        NEW.origin_type = 'athlete_session_request'
        AND link.source_type = 'athlete_session_request'
        AND link.source_id = NEW.origin_request_id::text
      )
      OR (
        link.source_type = 'production_brief'
        AND link.source_id = NEW.id::text
      )
    )
  ORDER BY CASE link.source_type WHEN 'athlete_session_request' THEN 0 ELSE 1 END
  LIMIT 1;

  next_state := canonical_creative_state_from_brief(NEW.status);

  IF target_mission_id IS NULL THEN
    INSERT INTO creative_missions (
      workspace_id, business_state, title, mission_type, scheduled_at,
      regularization_status, operational_creative_profile_id, created_by_actor
    ) VALUES (
      NEW.workspace_id,
      next_state,
      NEW.title,
      'production',
      CASE
        WHEN NEW.scheduled_date IS NULL THEN NULL
        ELSE NEW.scheduled_date::timestamp AT TIME ZONE NEW.planning_timezone
      END,
      'none',
      NEW.assigned_creative_profile_id,
      NEW.created_by_clerk_user_id
    )
    RETURNING id INTO target_mission_id;
    previous_state := NULL;
  ELSE
    SELECT business_state
    INTO previous_state
    FROM creative_missions
    WHERE workspace_id = NEW.workspace_id
      AND id = target_mission_id
    FOR UPDATE;

    UPDATE creative_missions
    SET business_state = next_state,
        title = NEW.title,
        scheduled_at = CASE
          WHEN NEW.scheduled_date IS NULL THEN scheduled_at
          ELSE NEW.scheduled_date::timestamp AT TIME ZONE NEW.planning_timezone
        END,
        operational_creative_profile_id = NEW.assigned_creative_profile_id,
        updated_at = NOW()
    WHERE workspace_id = NEW.workspace_id
      AND id = target_mission_id
      AND regularization_status = 'none';
  END IF;

  INSERT INTO creative_mission_links (
    workspace_id, mission_id, source_type, relation_type, source_id,
    production_brief_id, source_snapshot
  ) VALUES (
    NEW.workspace_id,
    target_mission_id,
    'production_brief',
    'production',
    NEW.id::text,
    NEW.id,
    jsonb_build_object(
      'originType', NEW.origin_type,
      'status', NEW.status,
      'title', NEW.title
    )
  )
  ON CONFLICT DO NOTHING;

  IF NEW.production_source = 'google_sheets'
    AND NEW.production_source_row IS NOT NULL
    AND NEW.production_source_fingerprint ~ '^[0-9a-f]{64}$' THEN
    INSERT INTO creative_mission_links (
      workspace_id, mission_id, source_type, relation_type, source_id,
      production_source, production_source_row, production_source_fingerprint,
      source_snapshot
    ) VALUES (
      NEW.workspace_id,
      target_mission_id,
      'production_sheet',
      'production',
      NEW.production_source || ':' || NEW.production_source_fingerprint,
      NEW.production_source,
      NEW.production_source_row,
      NEW.production_source_fingerprint,
      NEW.production_snapshot
    )
    ON CONFLICT DO NOTHING;
  END IF;

  FOR athlete IN
    SELECT value
    FROM jsonb_array_elements(NEW.athlete_refs)
  LOOP
    IF NULLIF(btrim(athlete->>'id'), '') IS NOT NULL THEN
      INSERT INTO creative_mission_athletes (
        workspace_id, mission_id, athlete_id, athlete_name_snapshot
      ) VALUES (
        NEW.workspace_id,
        target_mission_id,
        athlete->>'id',
        NULLIF(btrim(athlete->>'name'), '')
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  INSERT INTO creative_mission_events (
    workspace_id, mission_id, action, from_state, to_state,
    actor, details, idempotency_key
  ) VALUES (
    NEW.workspace_id,
    target_mission_id,
    'production_projection_updated',
    previous_state,
    next_state,
    NEW.created_by_clerk_user_id,
    jsonb_build_object('briefId', NEW.id, 'briefStatus', NEW.status),
    'brief:' || NEW.id::text || ':' || NEW.status || ':' || NEW.updated_at::text
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_creative_briefs_canonical_projection
  ON production_creative_briefs;
CREATE TRIGGER production_creative_briefs_canonical_projection
  AFTER INSERT OR UPDATE OF
    status,
    title,
    athlete_refs,
    scheduled_date,
    assigned_creative_profile_id,
    updated_at
  ON production_creative_briefs
  FOR EACH ROW
  EXECUTE FUNCTION sync_canonical_creative_production_brief();

CREATE OR REPLACE FUNCTION sync_canonical_creative_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_mission_id UUID;
  previous_state TEXT;
  next_state TEXT;
BEGIN
  SELECT link.mission_id
  INTO target_mission_id
  FROM creative_mission_links link
  WHERE link.workspace_id = NEW.workspace_id
    AND link.source_type = 'production_brief'
    AND link.source_id = NEW.brief_id::text;

  IF target_mission_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT business_state
  INTO previous_state
  FROM creative_missions
  WHERE workspace_id = NEW.workspace_id
    AND id = target_mission_id
  FOR UPDATE;

  next_state := CASE
    WHEN NEW.status <> 'active' THEN 'proposed'
    WHEN NEW.delivery_status = 'validated' THEN 'completed'
    WHEN NEW.delivery_status IN ('delivered', 'changes_requested') THEN 'review_delivery'
    WHEN NEW.confirmation_status = 'confirmed' THEN 'confirmed'
    ELSE 'proposed'
  END;

  UPDATE creative_missions
  SET business_state = next_state,
      operational_creative_profile_id = CASE
        WHEN NEW.status = 'active' THEN NEW.creative_profile_id
        ELSE operational_creative_profile_id
      END,
      occurred_at = CASE
        WHEN NEW.delivery_status = 'validated'
          THEN COALESCE(NEW.validated_at, NEW.delivered_at, occurred_at)
        ELSE occurred_at
      END,
      occurred_at_source = CASE
        WHEN NEW.delivery_status = 'validated' THEN 'production_delivery_validated_at'
        ELSE occurred_at_source
      END,
      updated_at = NOW()
  WHERE workspace_id = NEW.workspace_id
    AND id = target_mission_id
    AND regularization_status = 'none';

  INSERT INTO creative_mission_events (
    workspace_id, mission_id, action, from_state, to_state,
    actor, details, idempotency_key
  ) VALUES (
    NEW.workspace_id,
    target_mission_id,
    'assignment_projection_updated',
    previous_state,
    next_state,
    'projection:production_assignment',
    jsonb_build_object(
      'assignmentId', NEW.id,
      'assignmentStatus', NEW.status,
      'confirmationStatus', NEW.confirmation_status,
      'deliveryStatus', NEW.delivery_status
    ),
    'assignment:' || NEW.id::text || ':' || NEW.status || ':'
      || NEW.confirmation_status || ':' || NEW.delivery_status || ':' || NEW.updated_at::text
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_creative_assignments_canonical_projection
  ON production_creative_assignments;
CREATE TRIGGER production_creative_assignments_canonical_projection
  AFTER INSERT OR UPDATE OF
    status,
    confirmation_status,
    delivery_status,
    creative_profile_id,
    confirmed_at,
    delivered_at,
    validated_at,
    updated_at
  ON production_creative_assignments
  FOR EACH ROW
  EXECUTE FUNCTION sync_canonical_creative_assignment();

CREATE OR REPLACE FUNCTION append_canonical_creative_source_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_mission_id UUID;
  current_state TEXT;
BEGIN
  IF TG_TABLE_NAME = 'athlete_session_request_events' THEN
    SELECT link.mission_id
    INTO target_mission_id
    FROM creative_mission_links link
    WHERE link.workspace_id = NEW.workspace_id
      AND link.source_type = 'athlete_session_request'
      AND link.source_id = NEW.request_id::text;
  ELSE
    SELECT link.mission_id
    INTO target_mission_id
    FROM creative_mission_links link
    WHERE link.workspace_id = NEW.workspace_id
      AND link.source_type = 'production_brief'
      AND link.source_id = NEW.brief_id::text;
  END IF;

  IF target_mission_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT business_state
  INTO current_state
  FROM creative_missions
  WHERE workspace_id = NEW.workspace_id
    AND id = target_mission_id;

  INSERT INTO creative_mission_events (
    workspace_id, mission_id, action, from_state, to_state,
    actor, note, details, idempotency_key, created_at
  ) VALUES (
    NEW.workspace_id,
    target_mission_id,
    'source_event',
    current_state,
    current_state,
    NEW.actor_clerk_user_id,
    NULL,
    jsonb_build_object(
      'sourceTable', TG_TABLE_NAME,
      'sourceEventId', NEW.id,
      'sourceAction', NEW.action,
      'sourceDetails', NEW.details
    ),
    TG_TABLE_NAME || ':' || NEW.id::text,
    NEW.created_at
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS athlete_session_request_events_canonical_journal
  ON athlete_session_request_events;
CREATE TRIGGER athlete_session_request_events_canonical_journal
  AFTER INSERT ON athlete_session_request_events
  FOR EACH ROW
  EXECUTE FUNCTION append_canonical_creative_source_event();

DROP TRIGGER IF EXISTS production_creative_events_canonical_journal
  ON production_creative_events;
CREATE TRIGGER production_creative_events_canonical_journal
  AFTER INSERT ON production_creative_events
  FOR EACH ROW
  EXECUTE FUNCTION append_canonical_creative_source_event();

-- Existing modern rows are projected without changing any source value.
UPDATE athlete_session_requests
SET updated_at = updated_at;

UPDATE production_creative_briefs
SET updated_at = updated_at;

UPDATE production_creative_assignments
SET updated_at = updated_at;

COMMENT ON TABLE creative_missions IS
  'Projection métier additive des missions créatives. Le moteur d exécution reste Production/Créatifs.';
COMMENT ON TABLE creative_mission_athletes IS
  'Athlètes concernés par une mission canonique; une mission physique peut être multi-athlètes.';
COMMENT ON TABLE creative_mission_links IS
  'Provenance append-only reliant demandes, prestations, briefs et preuves Google Sheets à une seule mission par workspace.';
COMMENT ON TABLE creative_mission_events IS
  'Journal append-only des états métier et régularisations, distinct des journaux techniques sources.';
COMMENT ON COLUMN creative_missions.historical_creative_profile_id IS
  'Référence historique facultative vers une fiche sans créer d affectation, candidature, acceptation ou confirmation.';
COMMENT ON COLUMN creative_missions.regularization_status IS
  'Une régularisation historique ne fabrique ni brief, ni affectation, ni confirmation, ni livraison.';

COMMIT;
