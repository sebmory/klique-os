BEGIN;

ALTER TABLE creative_missions
  ADD COLUMN IF NOT EXISTS origin_kind TEXT NOT NULL DEFAULT 'projection',
  ADD COLUMN IF NOT EXISTS admin_creation_key UUID NULL,
  ADD COLUMN IF NOT EXISTS period_ends_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS location_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS region TEXT NULL,
  ADD COLUMN IF NOT EXISTS expected_deliverables TEXT NULL,
  ADD COLUMN IF NOT EXISTS context_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS usage_rights TEXT NULL,
  ADD COLUMN IF NOT EXISTS budget_amount_minor INTEGER NULL,
  ADD COLUMN IF NOT EXISTS expenses_covered BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS expense_terms TEXT NULL,
  ADD COLUMN IF NOT EXISTS response_deadline TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS search_mode TEXT NULL,
  ADD COLUMN IF NOT EXISTS blocking_reason TEXT NULL;

UPDATE creative_missions mission
SET origin_kind = CASE
  WHEN mission.regularization_status <> 'none' THEN 'historical'
  WHEN EXISTS (
    SELECT 1
    FROM creative_mission_links link
    WHERE link.workspace_id = mission.workspace_id
      AND link.mission_id = mission.id
      AND link.source_type = 'athlete_session_request'
  ) THEN 'athlete_request'
  WHEN EXISTS (
    SELECT 1
    FROM creative_mission_links link
    WHERE link.workspace_id = mission.workspace_id
      AND link.mission_id = mission.id
      AND link.source_type = 'production_brief'
  ) THEN 'production'
  ELSE 'projection'
END;

ALTER TABLE creative_missions
  DROP CONSTRAINT IF EXISTS creative_missions_business_state_check,
  ADD CONSTRAINT creative_missions_business_state_check CHECK (
    business_state IN (
      'review',
      'organize',
      'proposed',
      'confirmation_pending',
      'confirmed',
      'in_progress',
      'review_delivery',
      'changes_requested',
      'completed',
      'closed_without_action',
      'cancelled'
    )
  ),
  DROP CONSTRAINT IF EXISTS creative_missions_mission_type_check,
  ADD CONSTRAINT creative_missions_mission_type_check CHECK (
    mission_type IN (
      'media_day',
      'match_competition',
      'video',
      'interview',
      'production',
      'other'
    )
  ),
  ADD CONSTRAINT creative_missions_origin_kind_check CHECK (
    origin_kind IN (
      'projection',
      'athlete_request',
      'admin',
      'production',
      'historical'
    )
  ),
  ADD CONSTRAINT creative_missions_admin_creation_shape_check CHECK (
    (origin_kind = 'admin' AND admin_creation_key IS NOT NULL)
    OR (origin_kind <> 'admin' AND admin_creation_key IS NULL)
  ),
  ADD CONSTRAINT creative_missions_operational_fields_check CHECK (
    (period_ends_at IS NULL OR scheduled_at IS NULL OR period_ends_at >= scheduled_at)
    AND (budget_amount_minor IS NULL OR budget_amount_minor >= 0)
    AND (
      search_mode IS NULL
      OR search_mode IN ('single_creative', 'targeted_creatives', 'direct_assignment')
    )
    AND (location_name IS NULL OR NULLIF(btrim(location_name), '') IS NOT NULL)
    AND (region IS NULL OR NULLIF(btrim(region), '') IS NOT NULL)
    AND (
      expected_deliverables IS NULL
      OR NULLIF(btrim(expected_deliverables), '') IS NOT NULL
    )
    AND (context_notes IS NULL OR NULLIF(btrim(context_notes), '') IS NOT NULL)
    AND (usage_rights IS NULL OR NULLIF(btrim(usage_rights), '') IS NOT NULL)
    AND (expense_terms IS NULL OR NULLIF(btrim(expense_terms), '') IS NOT NULL)
    AND (blocking_reason IS NULL OR NULLIF(btrim(blocking_reason), '') IS NOT NULL)
  );

ALTER TABLE creative_mission_events
  DROP CONSTRAINT IF EXISTS creative_mission_events_to_state_check,
  ADD CONSTRAINT creative_mission_events_to_state_check CHECK (
    to_state IN (
      'review',
      'organize',
      'proposed',
      'confirmation_pending',
      'confirmed',
      'in_progress',
      'review_delivery',
      'changes_requested',
      'completed',
      'closed_without_action',
      'cancelled'
    )
  ),
  DROP CONSTRAINT IF EXISTS creative_mission_events_from_state_check,
  ADD CONSTRAINT creative_mission_events_from_state_check CHECK (
    from_state IS NULL
    OR from_state IN (
      'review',
      'organize',
      'proposed',
      'confirmation_pending',
      'confirmed',
      'in_progress',
      'review_delivery',
      'changes_requested',
      'completed',
      'closed_without_action',
      'cancelled'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS creative_missions_admin_creation_unique_idx
  ON creative_missions (workspace_id, admin_creation_key)
  WHERE admin_creation_key IS NOT NULL;

ALTER TABLE production_creative_briefs
  DROP CONSTRAINT IF EXISTS production_creative_briefs_origin_type_check,
  ADD CONSTRAINT production_creative_briefs_origin_type_check CHECK (
    origin_type IN ('admin_production', 'athlete_session_request', 'canonical_mission')
  ),
  ADD COLUMN IF NOT EXISTS response_deadline TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS production_creative_briefs_canonical_origin_unique_idx
  ON production_creative_briefs (workspace_id, origin_type, origin_request_id)
  WHERE origin_type = 'canonical_mission' AND origin_request_id IS NOT NULL;

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
    WHEN 'assigned' THEN 'confirmation_pending'
    WHEN 'creative_agreed' THEN 'confirmation_pending'
    WHEN 'confirmed' THEN 'confirmed'
    WHEN 'completed' THEN 'completed'
    WHEN 'refused' THEN 'closed_without_action'
    WHEN 'cancelled' THEN 'cancelled'
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
    WHEN 'assigned' THEN 'confirmation_pending'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'organize'
  END;
$$;

CREATE OR REPLACE FUNCTION enrich_canonical_creative_session_request()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_mission_id UUID;
BEGIN
  SELECT link.mission_id
  INTO target_mission_id
  FROM creative_mission_links link
  WHERE link.workspace_id = NEW.workspace_id
    AND link.source_type = 'athlete_session_request'
    AND link.source_id = NEW.id::text;

  IF target_mission_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE creative_missions
  SET origin_kind = 'athlete_request',
      period_ends_at = COALESCE(NEW.event_ends_at, period_ends_at),
      location_name = NEW.location_name,
      region = NEW.region,
      expected_deliverables = NEW.deliverables,
      context_notes = concat_ws(
        E'\n\n',
        NULLIF(btrim(NEW.objective), ''),
        NULLIF(btrim(NEW.practical_information), ''),
        NULLIF(btrim(NEW.constraints_comment), '')
      ),
      updated_at = NOW()
  WHERE workspace_id = NEW.workspace_id
    AND id = target_mission_id
    AND regularization_status = 'none';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_athlete_session_requests_canonical_enrichment
  ON athlete_session_requests;
CREATE TRIGGER zz_athlete_session_requests_canonical_enrichment
  AFTER INSERT OR UPDATE OF
    event_ends_at,
    location_name,
    region,
    objective,
    deliverables,
    practical_information,
    constraints_comment,
    updated_at
  ON athlete_session_requests
  FOR EACH ROW
  EXECUTE FUNCTION enrich_canonical_creative_session_request();

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

  IF NEW.origin_type = 'canonical_mission' THEN
    SELECT mission.id
    INTO target_mission_id
    FROM creative_missions mission
    WHERE mission.workspace_id = NEW.workspace_id
      AND mission.id = NEW.origin_request_id
      AND mission.regularization_status = 'none';
  ELSE
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
  END IF;

  next_state := canonical_creative_state_from_brief(NEW.status);

  IF target_mission_id IS NULL THEN
    INSERT INTO creative_missions (
      workspace_id, business_state, title, mission_type, scheduled_at,
      origin_kind, location_name, region, expected_deliverables, context_notes,
      response_deadline, regularization_status,
      operational_creative_profile_id, created_by_actor
    ) VALUES (
      NEW.workspace_id,
      next_state,
      NEW.title,
      'production',
      CASE
        WHEN NEW.scheduled_date IS NULL THEN NULL
        ELSE NEW.scheduled_date::timestamp AT TIME ZONE NEW.planning_timezone
      END,
      'production',
      NEW.location_details,
      NEW.region,
      NEW.deliverables,
      NEW.objective,
      NEW.response_deadline,
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
        location_name = COALESCE(NEW.location_details, location_name),
        region = NEW.region,
        expected_deliverables = NEW.deliverables,
        context_notes = NEW.objective,
        response_deadline = NEW.response_deadline,
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
    WHEN NEW.delivery_status = 'changes_requested' THEN 'changes_requested'
    WHEN NEW.delivery_status = 'delivered' THEN 'review_delivery'
    WHEN NEW.confirmation_status = 'confirmed' THEN 'confirmed'
    ELSE 'confirmation_pending'
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

-- Existing modern projections receive the operational fields without changing
-- historical regularizations.
UPDATE athlete_session_requests
SET updated_at = updated_at;

UPDATE production_creative_briefs
SET updated_at = updated_at;

COMMIT;
