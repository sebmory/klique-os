BEGIN;

ALTER TABLE athlete_service_requests
  ADD COLUMN is_admin_membership_realization BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION is_identifiable_admin_membership_realization(
  realization athlete_service_requests
) RETURNS BOOLEAN
LANGUAGE sql
AS $$
  SELECT COALESCE(
    realization.fulfillment_mode = 'included_right'
    AND realization.status = 'completed'
    AND realization.snapshot_credit_quantity = 1
    AND realization.snapshot_price_chf IS NULL
    AND realization.purchase_id IS NULL
    AND realization.requested_at = realization.scheduled_at
    AND realization.scheduled_at = realization.started_at
    AND realization.started_at = realization.completed_at
    AND realization.created_at = realization.updated_at
    AND jsonb_typeof(realization.requested_details->'historicalRealizationAt') = 'string'
    AND realization.requested_details->>'historicalRealizationAt'
      = to_char(realization.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    AND jsonb_typeof(realization.requested_details->'recordedByClerkUserId') = 'string'
    AND btrim(realization.requested_details->>'recordedByClerkUserId') <> ''
    AND (
      NOT realization.requested_details ? 'message'
      OR (
        jsonb_typeof(realization.requested_details->'message') = 'string'
        AND length(btrim(realization.requested_details->>'message')) BETWEEN 1 AND 2000
      )
    )
    AND realization.requested_details
      - 'message' - 'historicalRealizationAt' - 'recordedByClerkUserId' = '{}'::jsonb
    AND EXISTS (
      SELECT 1
      FROM athlete_credit_movements usage
      JOIN athlete_memberships membership
        ON membership.id = usage.membership_id
       AND membership.workspace_id = usage.workspace_id
       AND membership.athlete_id = usage.athlete_id
      WHERE usage.id = realization.usage_movement_id
        AND usage.workspace_id = realization.workspace_id
        AND usage.athlete_id = realization.athlete_id
        AND usage.credit_type = realization.snapshot_credit_type
        AND usage.source = 'usage'
        AND usage.quantity = -1
        AND usage.expires_at IS NULL
        AND usage.created_at = realization.created_at
        AND usage.reference_id = 'athlete_service_request:' || realization.id::text
        AND realization.completed_at >= membership.starts_at
        AND (membership.ends_at IS NULL OR realization.completed_at <= membership.ends_at)
        AND realization.product_code = CASE usage.credit_type
          WHEN 'production' THEN 'photo_session_standard'
          WHEN 'custom_content' THEN 'custom_content_single'
        END
    ), FALSE
  );
$$;

-- Only the exact, server-written signature of the Admin workflow is backfilled.
UPDATE athlete_service_requests realization
SET is_admin_membership_realization = TRUE
WHERE is_identifiable_admin_membership_realization(realization);

CREATE OR REPLACE FUNCTION protect_admin_membership_realization()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_admin_membership_realization THEN
    RAISE EXCEPTION 'Admin membership realizations are immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_admin_membership_realization THEN
    RAISE EXCEPTION 'Ordinary requests cannot become Admin realizations';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER athlete_service_requests_admin_realization_immutable
  BEFORE UPDATE OR DELETE ON athlete_service_requests
  FOR EACH ROW EXECUTE FUNCTION protect_admin_membership_realization();

CREATE OR REPLACE FUNCTION validate_admin_membership_realization()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_admin_membership_realization
    AND NOT is_identifiable_admin_membership_realization(NEW) THEN
    RAISE EXCEPTION 'Invalid Admin membership realization';
  END IF;
  RETURN NEW;
END;
$$;

-- Deferred validation sees the usage inserted by the same data-modifying CTE.
CREATE CONSTRAINT TRIGGER athlete_service_requests_admin_realization_valid
  AFTER INSERT ON athlete_service_requests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_admin_membership_realization();

ALTER TABLE athlete_credit_movements
  ADD COLUMN reversal_realization_id UUID NULL
    REFERENCES athlete_service_requests (id) ON DELETE RESTRICT,
  ADD COLUMN cancellation_reason TEXT NULL,
  ADD COLUMN cancelled_by_clerk_user_id TEXT NULL;

ALTER TABLE athlete_credit_movements
  DROP CONSTRAINT athlete_credit_movements_source_check,
  DROP CONSTRAINT athlete_credit_movements_check,
  DROP CONSTRAINT athlete_credit_movements_check1;

-- These are the exact PostgreSQL-generated names and definitions from
-- 20260901_athlete_credit_catalog_v1.sql. Only usage_reversal is added.
ALTER TABLE athlete_credit_movements
  ADD CONSTRAINT athlete_credit_movements_source_check
    CHECK (source IN ('plan_grant', 'admin_adjustment', 'purchase', 'usage', 'usage_reversal')),
  ADD CONSTRAINT athlete_credit_movements_check CHECK (
    (source IN ('plan_grant', 'purchase') AND quantity > 0)
    OR (source = 'usage' AND quantity < 0)
    OR source = 'admin_adjustment'
    OR (source = 'usage_reversal' AND quantity = 1)
  ),
  ADD CONSTRAINT athlete_credit_movements_check1
    CHECK (source NOT IN ('plan_grant', 'purchase') OR expires_at IS NOT NULL),
  ADD CONSTRAINT athlete_credit_movements_reversal_check CHECK (
    (
      source = 'usage_reversal'
      AND reversal_realization_id IS NOT NULL
      AND membership_id IS NOT NULL
      AND expires_at IS NULL
      AND cancellation_reason IS NOT NULL
      AND cancellation_reason = btrim(cancellation_reason)
      AND length(cancellation_reason) BETWEEN 1 AND 2000
      AND cancellation_reason ~ '[^[:space:]]'
      AND cancelled_by_clerk_user_id IS NOT NULL
      AND btrim(cancelled_by_clerk_user_id) <> ''
      AND cancelled_by_clerk_user_id ~ '[^[:space:]]'
      AND reference_id IS NOT NULL
      AND reference_id = 'athlete_service_request_reversal:' || reversal_realization_id::text
    )
    OR (
      source <> 'usage_reversal'
      AND reversal_realization_id IS NULL
      AND cancellation_reason IS NULL
      AND cancelled_by_clerk_user_id IS NULL
    )
  );

CREATE UNIQUE INDEX athlete_credit_movements_realization_reversal_unique_idx
  ON athlete_credit_movements (reversal_realization_id)
  WHERE reversal_realization_id IS NOT NULL;

CREATE INDEX athlete_service_requests_admin_realization_history_idx
  ON athlete_service_requests (workspace_id, athlete_id, created_at DESC, id DESC)
  WHERE is_admin_membership_realization;

CREATE OR REPLACE FUNCTION validate_admin_membership_realization_reversal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source <> 'usage_reversal' THEN
    RETURN NEW;
  END IF;
  PERFORM membership.id
  FROM athlete_memberships membership
  WHERE membership.id = NEW.membership_id
    AND membership.workspace_id = NEW.workspace_id
    AND membership.athlete_id = NEW.athlete_id
    AND membership.status = 'active'
    AND membership.starts_at <= statement_timestamp()
    AND (membership.ends_at IS NULL OR membership.ends_at > statement_timestamp())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reversal membership scope mismatch or inactive membership';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM athlete_service_requests realization
    JOIN athlete_credit_movements usage ON usage.id = realization.usage_movement_id
    WHERE realization.id = NEW.reversal_realization_id
      AND realization.is_admin_membership_realization
      AND realization.fulfillment_mode = 'included_right'
      AND realization.status = 'completed'
      AND realization.snapshot_credit_quantity = 1
      AND realization.workspace_id = NEW.workspace_id
      AND realization.athlete_id = NEW.athlete_id
      AND realization.snapshot_credit_type = NEW.credit_type
      AND usage.workspace_id = NEW.workspace_id
      AND usage.athlete_id = NEW.athlete_id
      AND usage.membership_id = NEW.membership_id
      AND usage.credit_type = NEW.credit_type
      AND usage.source = 'usage'
      AND usage.quantity = -1
      AND usage.reference_id = 'athlete_service_request:' || realization.id::text
      AND realization.product_code = CASE NEW.credit_type
        WHEN 'production' THEN 'photo_session_standard'
        WHEN 'custom_content' THEN 'custom_content_single'
      END
      AND NEW.created_at >= realization.created_at
  ) THEN
    RAISE EXCEPTION 'Reversal must reference a matching Admin realization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER athlete_credit_movements_validate_realization_reversal
  BEFORE INSERT ON athlete_credit_movements
  FOR EACH ROW EXECUTE FUNCTION validate_admin_membership_realization_reversal();

COMMENT ON COLUMN athlete_service_requests.is_admin_membership_realization IS
  'Server-only provenance. Marked requests and their original snapshots are immutable.';
COMMENT ON COLUMN athlete_credit_movements.reversal_realization_id IS
  'Unique append-only cancellation of an Admin membership realization; never a new entitlement.';
COMMENT ON COLUMN athlete_credit_movements.cancellation_reason IS
  'Cancellation audit: mandatory reason, created_at is the cancellation time.';

COMMIT;
