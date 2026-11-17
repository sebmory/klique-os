BEGIN;

ALTER TABLE creative_missions
  ADD COLUMN IF NOT EXISTS targeted_creative_profile_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE creative_missions
  DROP CONSTRAINT IF EXISTS creative_missions_targeted_creatives_check,
  ADD CONSTRAINT creative_missions_targeted_creatives_check CHECK (
    search_mode <> 'single_creative'
    OR cardinality(targeted_creative_profile_ids) <= 1
  );

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_operational_reminder_check,
  ADD CONSTRAINT notifications_operational_reminder_check CHECK (
    jsonb_typeof(metadata) = 'object'
    AND NOT (completed_at IS NOT NULL AND cancelled_at IS NOT NULL)
    AND (
      source_type <> 'creative_mission_reminder'
      OR (
        scheduled_for IS NOT NULL
        AND metadata->>'kind' IN ('athlete_j2', 'creative_j1')
      )
    )
  );

CREATE INDEX IF NOT EXISTS notifications_active_schedule_idx
  ON notifications (workspace_id, scheduled_for, source_id)
  WHERE scheduled_for IS NOT NULL
    AND completed_at IS NULL
    AND cancelled_at IS NULL;

CREATE OR REPLACE FUNCTION reconcile_creative_mission_reminders(
  target_workspace_id TEXT,
  target_mission_id UUID
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  mission_record RECORD;
  athlete_record RECORD;
  creative_record RECORD;
  target_location TEXT;
  has_existing_reminders BOOLEAN;
BEGIN
  SELECT mission.*
  INTO mission_record
  FROM creative_missions mission
  WHERE mission.workspace_id = target_workspace_id
    AND mission.id = target_mission_id;

  IF mission_record.id IS NULL THEN
    RETURN;
  END IF;

  SELECT athlete.athlete_id, athlete.athlete_name_snapshot
  INTO athlete_record
  FROM creative_mission_athletes athlete
  WHERE athlete.workspace_id = target_workspace_id
    AND athlete.mission_id = target_mission_id
  ORDER BY athlete.created_at, athlete.athlete_id
  LIMIT 1;

  SELECT profile.id, profile.display_name
  INTO creative_record
  FROM creative_profiles profile
  WHERE profile.workspace_id = target_workspace_id
    AND profile.id = mission_record.operational_creative_profile_id
    AND profile.status = 'active';

  SELECT EXISTS (
    SELECT 1
    FROM notifications notification
    WHERE notification.workspace_id = target_workspace_id
      AND notification.source_type = 'creative_mission_reminder'
      AND notification.source_id LIKE target_mission_id::text || ':%'
  ) INTO has_existing_reminders;

  IF (
    mission_record.business_state NOT IN (
      'confirmed',
      'in_progress',
      'review_delivery',
      'changes_requested'
    )
    OR mission_record.scheduled_at IS NULL
    OR athlete_record.athlete_id IS NULL
    OR creative_record.id IS NULL
    OR (
      mission_record.business_state <> 'confirmed'
      AND NOT has_existing_reminders
    )
  ) THEN
    UPDATE notifications
    SET cancelled_at = COALESCE(cancelled_at, NOW())
    WHERE workspace_id = target_workspace_id
      AND source_type = 'creative_mission_reminder'
      AND source_id LIKE target_mission_id::text || ':%'
      AND completed_at IS NULL
      AND cancelled_at IS NULL;
    RETURN;
  END IF;

  target_location := NULLIF(concat_ws(
    ', ',
    NULLIF(btrim(mission_record.location_name), ''),
    NULLIF(btrim(mission_record.region), '')
  ), '');

  INSERT INTO notifications (
    id,
    workspace_id,
    recipient_clerk_user_id,
    type,
    title,
    body,
    action_href,
    source_type,
    source_id,
    scheduled_for,
    metadata
  )
  SELECT
    gen_random_uuid(),
    target_workspace_id,
    admin_access.clerk_user_id,
    'creative_mission.reminder',
    reminder.title,
    concat_ws(
      ' · ',
      mission_record.title,
      COALESCE(athlete_record.athlete_name_snapshot, athlete_record.athlete_id),
      creative_record.display_name,
      to_char(
        mission_record.scheduled_at AT TIME ZONE 'Europe/Zurich',
        'DD.MM.YYYY HH24:MI'
      ),
      target_location
    ),
    '/today#mission-reminders',
    'creative_mission_reminder',
    target_mission_id::text || ':' || reminder.kind,
    (
      (
        (mission_record.scheduled_at AT TIME ZONE 'Europe/Zurich')::date
        - reminder.days_before
      )::date + time '09:00'
    ) AT TIME ZONE 'Europe/Zurich',
    jsonb_strip_nulls(jsonb_build_object(
      'kind', reminder.kind,
      'athleteName', COALESCE(
        athlete_record.athlete_name_snapshot,
        athlete_record.athlete_id
      ),
      'creativeName', creative_record.display_name,
      'missionTitle', mission_record.title,
      'scheduledAt', mission_record.scheduled_at,
      'location', target_location,
      'confirmedInformation', NULLIF(btrim(mission_record.context_notes), '')
    ))
  FROM user_access admin_access
  CROSS JOIN (
    VALUES
      ('athlete_j2'::text, 2, 'Rappel J-2 — Athlète'::text),
      ('creative_j1'::text, 1, 'Rappel J-1 — Créatif'::text)
  ) AS reminder(kind, days_before, title)
  WHERE admin_access.workspace_id = target_workspace_id
    AND admin_access.role = 'admin'
    AND admin_access.status = 'active'
    AND btrim(admin_access.clerk_user_id) <> ''
  ON CONFLICT (
    workspace_id,
    recipient_clerk_user_id,
    source_type,
    source_id
  ) WHERE source_type IS NOT NULL AND source_id IS NOT NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    action_href = EXCLUDED.action_href,
    scheduled_for = EXCLUDED.scheduled_for,
    metadata = EXCLUDED.metadata,
    cancelled_at = NULL
  WHERE notifications.completed_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION trigger_reconcile_creative_mission_reminders()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM reconcile_creative_mission_reminders(NEW.workspace_id, NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS creative_missions_operational_reminders
  ON creative_missions;
CREATE TRIGGER creative_missions_operational_reminders
  AFTER INSERT OR UPDATE OF
    business_state,
    scheduled_at,
    location_name,
    region,
    context_notes,
    operational_creative_profile_id,
    title
  ON creative_missions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_reconcile_creative_mission_reminders();

CREATE OR REPLACE FUNCTION trigger_reconcile_creative_mission_athlete_reminders()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM reconcile_creative_mission_reminders(
    COALESCE(NEW.workspace_id, OLD.workspace_id),
    COALESCE(NEW.mission_id, OLD.mission_id)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS creative_mission_athletes_operational_reminders
  ON creative_mission_athletes;
CREATE TRIGGER creative_mission_athletes_operational_reminders
  AFTER INSERT OR UPDATE OR DELETE
  ON creative_mission_athletes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_reconcile_creative_mission_athlete_reminders();

SELECT reconcile_creative_mission_reminders(mission.workspace_id, mission.id)
FROM creative_missions mission
WHERE mission.business_state = 'confirmed';

COMMIT;
