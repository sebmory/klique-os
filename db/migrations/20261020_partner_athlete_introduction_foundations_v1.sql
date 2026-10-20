BEGIN;

ALTER TABLE contact_requests
  ADD COLUMN IF NOT EXISTS flow_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS athlete_response_enabled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS responded_by_clerk_user_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS athlete_seen_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS partner_contact_viewed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS authorized_contact_channel TEXT NULL,
  ADD COLUMN IF NOT EXISTS authorized_contact_value_snapshot TEXT NULL,
  ADD COLUMN IF NOT EXISTS authorized_contact_reference TEXT NULL,
  ADD COLUMN IF NOT EXISTS contact_consented_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS partner_public_name_snapshot TEXT NULL,
  ADD COLUMN IF NOT EXISTS athlete_public_name_snapshot TEXT NULL,
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'clear',
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS moderated_by_clerk_user_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS creation_idempotency_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS creation_payload_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS response_idempotency_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS response_payload_hash TEXT NULL;

ALTER TABLE contact_requests
  DROP CONSTRAINT IF EXISTS contact_requests_status_check;

ALTER TABLE contact_requests
  ADD CONSTRAINT contact_requests_status_check
    CHECK (
      status IN (
        'open',
        'pending',
        'in_progress',
        'resolved',
        'awaiting_athlete',
        'accepted',
        'declined'
      )
    ),
  ADD CONSTRAINT contact_requests_flow_version_check
    CHECK (flow_version >= 1),
  ADD CONSTRAINT contact_requests_moderation_status_check
    CHECK (moderation_status IN ('clear', 'suspended')),
  ADD CONSTRAINT contact_requests_v2_kind_status_check
    CHECK (
      flow_version < 2
      OR request_kind <> 'partner_athlete_introduction'
      OR status IN ('awaiting_athlete', 'accepted', 'declined')
    ),
  ADD CONSTRAINT contact_requests_v2_activation_check
    CHECK (
      flow_version < 2
      OR request_kind <> 'partner_athlete_introduction'
      OR (
        athlete_response_enabled_at IS NOT NULL
        AND NULLIF(btrim(partner_public_name_snapshot), '') IS NOT NULL
        AND NULLIF(btrim(athlete_public_name_snapshot), '') IS NOT NULL
        AND NULLIF(btrim(creation_idempotency_key), '') IS NOT NULL
        AND NULLIF(btrim(creation_payload_hash), '') IS NOT NULL
      )
    ),
  ADD CONSTRAINT contact_requests_v2_response_check
    CHECK (
      flow_version < 2
      OR request_kind <> 'partner_athlete_introduction'
      OR (
        status = 'awaiting_athlete'
        AND responded_at IS NULL
        AND responded_by_clerk_user_id IS NULL
        AND authorized_contact_channel IS NULL
        AND authorized_contact_value_snapshot IS NULL
        AND authorized_contact_reference IS NULL
        AND contact_consented_at IS NULL
        AND response_idempotency_key IS NULL
        AND response_payload_hash IS NULL
      )
      OR (
        status = 'declined'
        AND responded_at IS NOT NULL
        AND NULLIF(btrim(responded_by_clerk_user_id), '') IS NOT NULL
        AND authorized_contact_channel IS NULL
        AND authorized_contact_value_snapshot IS NULL
        AND authorized_contact_reference IS NULL
        AND contact_consented_at IS NULL
        AND NULLIF(btrim(response_idempotency_key), '') IS NOT NULL
        AND NULLIF(btrim(response_payload_hash), '') IS NOT NULL
      )
      OR (
        status = 'accepted'
        AND responded_at IS NOT NULL
        AND NULLIF(btrim(responded_by_clerk_user_id), '') IS NOT NULL
        AND authorized_contact_channel = 'instagram'
        AND NULLIF(btrim(authorized_contact_value_snapshot), '') IS NOT NULL
        AND NULLIF(btrim(authorized_contact_reference), '') IS NOT NULL
        AND contact_consented_at IS NOT NULL
        AND NULLIF(btrim(response_idempotency_key), '') IS NOT NULL
        AND NULLIF(btrim(response_payload_hash), '') IS NOT NULL
      )
    ),
  ADD CONSTRAINT contact_requests_suspension_audit_check
    CHECK (
      moderation_status = 'clear'
      OR (
        moderated_at IS NOT NULL
        AND NULLIF(btrim(moderated_by_clerk_user_id), '') IS NOT NULL
        AND NULLIF(btrim(moderation_reason), '') IS NOT NULL
      )
    );

DO $$
DECLARE
  duplicate_pairs TEXT;
BEGIN
  SELECT string_agg(
    format(
      'workspace=%L partner=%L athlete=%L count=%s',
      workspace_id,
      partner_id,
      athlete_id,
      pair_count
    ),
    '; '
    ORDER BY workspace_id, partner_id, athlete_id
  )
  INTO duplicate_pairs
  FROM (
    SELECT workspace_id, partner_id, athlete_id, COUNT(*) AS pair_count
    FROM contact_requests
    WHERE request_kind = 'partner_athlete_introduction'
      AND status IN ('pending', 'awaiting_athlete')
    GROUP BY workspace_id, partner_id, athlete_id
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_pairs IS NOT NULL THEN
    RAISE EXCEPTION
      'Précontrôle requis avant unicité pending/awaiting_athlete : %',
      duplicate_pairs;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS contact_requests_workspace_id_unique_idx
  ON contact_requests (workspace_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS contact_requests_unresolved_partner_athlete_unique_idx
  ON contact_requests (workspace_id, partner_id, athlete_id)
  WHERE request_kind = 'partner_athlete_introduction'
    AND status IN ('pending', 'awaiting_athlete');

CREATE UNIQUE INDEX IF NOT EXISTS contact_requests_partner_creation_idempotency_unique_idx
  ON contact_requests (workspace_id, partner_id, creation_idempotency_key)
  WHERE request_kind = 'partner_athlete_introduction'
    AND creation_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contact_requests_response_idempotency_unique_idx
  ON contact_requests (workspace_id, id, response_idempotency_key)
  WHERE request_kind = 'partner_athlete_introduction'
    AND response_idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS partner_solicitation_controls (
  workspace_id TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  can_solicit BOOLEAN NOT NULL DEFAULT TRUE,
  disabled_at TIMESTAMPTZ NULL,
  disabled_by_clerk_user_id TEXT NULL,
  disabled_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, partner_id),
  CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CHECK (NULLIF(btrim(partner_id), '') IS NOT NULL),
  CHECK (
    can_solicit
    OR (
      disabled_at IS NOT NULL
      AND NULLIF(btrim(disabled_by_clerk_user_id), '') IS NOT NULL
      AND NULLIF(btrim(disabled_reason), '') IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS partner_athlete_introduction_events (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'request_created',
      'athlete_accepted',
      'athlete_declined',
      'moderation_suspended',
      'moderation_reactivated',
      'athlete_reported'
    )
  ),
  actor_clerk_user_id TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (
    actor_role IN ('admin', 'athlete', 'partner_expert')
  ),
  request_status TEXT NOT NULL CHECK (
    request_status IN (
      'pending',
      'awaiting_athlete',
      'accepted',
      'declined',
      'in_progress',
      'resolved'
    )
  ),
  moderation_status TEXT NOT NULL CHECK (
    moderation_status IN ('clear', 'suspended')
  ),
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_athlete_introduction_events_request_fk
    FOREIGN KEY (workspace_id, request_id)
    REFERENCES contact_requests (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT partner_athlete_introduction_events_workspace_id_unique
    UNIQUE (workspace_id, id),
  CONSTRAINT partner_athlete_introduction_events_idempotency_unique
    UNIQUE (workspace_id, request_id, idempotency_key),
  CHECK (NULLIF(btrim(actor_clerk_user_id), '') IS NOT NULL),
  CHECK (NULLIF(btrim(idempotency_key), '') IS NOT NULL),
  CHECK (NULLIF(btrim(payload_hash), '') IS NOT NULL)
);

CREATE OR REPLACE FUNCTION reject_partner_athlete_introduction_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'partner_athlete_introduction_events est append-only';
END;
$$;

DROP TRIGGER IF EXISTS partner_athlete_introduction_events_append_only
  ON partner_athlete_introduction_events;

CREATE TRIGGER partner_athlete_introduction_events_append_only
  BEFORE UPDATE OR DELETE ON partner_athlete_introduction_events
  FOR EACH ROW
  EXECUTE FUNCTION reject_partner_athlete_introduction_event_mutation();

CREATE TABLE IF NOT EXISTS partner_athlete_introduction_reports (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  reported_by_clerk_user_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'reviewing', 'resolved', 'dismissed')
  ),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_at TIMESTAMPTZ NULL,
  handled_by_clerk_user_id TEXT NULL,
  handling_note TEXT NULL,
  CONSTRAINT partner_athlete_introduction_reports_request_fk
    FOREIGN KEY (workspace_id, request_id)
    REFERENCES contact_requests (workspace_id, id)
    ON DELETE RESTRICT,
  CHECK (NULLIF(btrim(reported_by_clerk_user_id), '') IS NOT NULL),
  CHECK (NULLIF(btrim(athlete_id), '') IS NOT NULL),
  CHECK (NULLIF(btrim(reason), '') IS NOT NULL),
  CHECK (
    status IN ('open', 'reviewing')
    OR (
      handled_at IS NOT NULL
      AND NULLIF(btrim(handled_by_clerk_user_id), '') IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS partner_athlete_introduction_reports_admin_idx
  ON partner_athlete_introduction_reports (workspace_id, status, reported_at DESC);

CREATE TABLE IF NOT EXISTS partner_athlete_introduction_notification_outbox (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  event_id UUID NOT NULL,
  recipient_clerk_user_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_href TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'delivered', 'failed', 'discarded')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ NULL,
  locked_by TEXT NULL,
  delivered_at TIMESTAMPTZ NULL,
  notification_id UUID NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_athlete_introduction_outbox_event_fk
    FOREIGN KEY (workspace_id, event_id)
    REFERENCES partner_athlete_introduction_events (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT partner_athlete_introduction_outbox_event_recipient_unique
    UNIQUE (workspace_id, event_id, recipient_clerk_user_id),
  CHECK (NULLIF(btrim(recipient_clerk_user_id), '') IS NOT NULL),
  CHECK (NULLIF(btrim(notification_type), '') IS NOT NULL),
  CHECK (NULLIF(btrim(title), '') IS NOT NULL),
  CHECK (NULLIF(btrim(body), '') IS NOT NULL),
  CHECK (
    btrim(action_href) LIKE '/%'
    AND btrim(action_href) NOT LIKE '//%'
  ),
  CHECK (
    status NOT IN ('delivered', 'discarded')
    OR (
      status = 'discarded'
      OR (
        delivered_at IS NOT NULL
        AND notification_id IS NOT NULL
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS partner_athlete_introduction_outbox_delivery_idx
  ON partner_athlete_introduction_notification_outbox (
    status,
    next_attempt_at,
    created_at
  )
  WHERE status <> 'delivered';

CREATE OR REPLACE FUNCTION protect_partner_athlete_introduction_outbox_payload()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.event_id IS DISTINCT FROM OLD.event_id
    OR NEW.recipient_clerk_user_id IS DISTINCT FROM OLD.recipient_clerk_user_id
    OR NEW.notification_type IS DISTINCT FROM OLD.notification_type
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.body IS DISTINCT FROM OLD.body
    OR NEW.action_href IS DISTINCT FROM OLD.action_href
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Le payload de notification est immuable';
  END IF;

  IF OLD.status IN ('delivered', 'discarded') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Une notification finalisée est immuable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_athlete_introduction_outbox_payload_guard
  ON partner_athlete_introduction_notification_outbox;

CREATE TRIGGER partner_athlete_introduction_outbox_payload_guard
  BEFORE UPDATE ON partner_athlete_introduction_notification_outbox
  FOR EACH ROW
  EXECUTE FUNCTION protect_partner_athlete_introduction_outbox_payload();

COMMENT ON TABLE partner_athlete_introduction_notification_outbox IS
  'Outbox limitée aux mises en relation. Le processeur serveur réclame les lignes avec FOR UPDATE SKIP LOCKED, insère notifications avec source_type=partner_athlete_introduction_event et source_id=event_id, puis marque delivered dans la même transaction. Un rejeu utilise ON CONFLICT sur notifications, reprend les lignes processing expirées et ne modifie jamais le payload. Aucun worker ni cron n’est activé par cette migration.';

COMMENT ON INDEX contact_requests_unresolved_partner_athlete_unique_idx IS
  'Empêche deux demandes pending/awaiting_athlete pour une paire, y compris suspendues. Le repository prend aussi un verrou transactionnel par paire avant de vérifier suspension et délai de 30 jours.';

COMMENT ON COLUMN contact_requests.response_idempotency_key IS
  'Le repository verrouille la demande avec SELECT FOR UPDATE pour sérialiser réponse et suspension, puis applique une transition conditionnelle exigeant flow_version>=2, status=awaiting_athlete et moderation_status=clear. Seuls les tests PostgreSQL isolés peuvent prouver cette concurrence réelle.';

COMMIT;
