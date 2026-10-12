BEGIN;

CREATE TABLE IF NOT EXISTS creative_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  creative_profile_id UUID NOT NULL,
  clerk_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  invitation_email TEXT NOT NULL,
  invited_by_clerk_user_id TEXT NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creative_access_workspace_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT creative_access_clerk_user_not_blank
    CHECK (NULLIF(btrim(clerk_user_id), '') IS NOT NULL),
  CONSTRAINT creative_access_invitation_email_not_blank
    CHECK (NULLIF(btrim(invitation_email), '') IS NOT NULL),
  CONSTRAINT creative_access_profile_workspace_fk
    FOREIGN KEY (workspace_id, creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_access_activation_check CHECK (activated_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS creative_access_workspace_profile_unique_idx
  ON creative_access (workspace_id, creative_profile_id);

CREATE UNIQUE INDEX IF NOT EXISTS creative_access_workspace_clerk_unique_idx
  ON creative_access (workspace_id, clerk_user_id);

CREATE INDEX IF NOT EXISTS creative_access_workspace_status_idx
  ON creative_access (workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS creative_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  creative_profile_id UUID NOT NULL,
  email TEXT NOT NULL,
  clerk_invitation_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'expired', 'revoked')),
  invited_by_clerk_user_id TEXT NOT NULL,
  accepted_clerk_user_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  CONSTRAINT creative_invitations_workspace_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT creative_invitations_email_not_blank
    CHECK (NULLIF(btrim(email), '') IS NOT NULL),
  CONSTRAINT creative_invitations_profile_workspace_fk
    FOREIGN KEY (workspace_id, creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS creative_invitations_workspace_profile_pending_unique_idx
  ON creative_invitations (workspace_id, creative_profile_id)
  WHERE status = 'invited';

CREATE UNIQUE INDEX IF NOT EXISTS creative_invitations_workspace_email_pending_unique_idx
  ON creative_invitations (workspace_id, lower(btrim(email)))
  WHERE status = 'invited';

CREATE INDEX IF NOT EXISTS creative_invitations_email_status_idx
  ON creative_invitations (lower(btrim(email)), status);

CREATE TABLE IF NOT EXISTS creative_mission_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  service_request_id UUID NOT NULL,
  mission_id UUID NOT NULL,
  creative_profile_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'refused')),
  note TEXT NULL,
  author_clerk_user_id TEXT NOT NULL,
  last_idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creative_mission_responses_workspace_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT creative_mission_responses_author_not_blank
    CHECK (NULLIF(btrim(author_clerk_user_id), '') IS NOT NULL),
  CONSTRAINT creative_mission_responses_request_workspace_fk
    FOREIGN KEY (workspace_id, service_request_id)
    REFERENCES athlete_service_requests (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_mission_responses_profile_workspace_fk
    FOREIGN KEY (workspace_id, creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_mission_responses_mission_workspace_fk
    FOREIGN KEY (workspace_id, service_request_id, mission_id)
    REFERENCES athlete_service_request_missions (workspace_id, service_request_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_mission_responses_note_check
    CHECK (char_length(COALESCE(note, '')) <= 500 AND (status <> 'refused' OR NULLIF(btrim(note), '') IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS creative_mission_responses_request_profile_unique_idx
  ON creative_mission_responses (workspace_id, service_request_id, creative_profile_id);

CREATE INDEX IF NOT EXISTS creative_mission_responses_status_updated_idx
  ON creative_mission_responses (workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS creative_mission_response_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  service_request_id UUID NOT NULL,
  mission_id UUID NOT NULL,
  creative_profile_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('accepted', 'refused')),
  note TEXT NULL,
  author_clerk_user_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creative_mission_response_events_workspace_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT creative_mission_response_events_author_not_blank
    CHECK (NULLIF(btrim(author_clerk_user_id), '') IS NOT NULL),
  CONSTRAINT creative_mission_response_events_fingerprint_not_blank
    CHECK (NULLIF(btrim(request_fingerprint), '') IS NOT NULL),
  CONSTRAINT creative_mission_response_events_note_check
    CHECK (char_length(COALESCE(note, '')) <= 500 AND (action <> 'refused' OR NULLIF(btrim(note), '') IS NOT NULL)),
  CONSTRAINT creative_mission_response_events_request_workspace_fk
    FOREIGN KEY (workspace_id, service_request_id)
    REFERENCES athlete_service_requests (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_mission_response_events_profile_workspace_fk
    FOREIGN KEY (workspace_id, creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_mission_response_events_mission_workspace_fk
    FOREIGN KEY (workspace_id, service_request_id, mission_id)
    REFERENCES athlete_service_request_missions (workspace_id, service_request_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS creative_mission_response_events_idempotency_unique_idx
  ON creative_mission_response_events (workspace_id, service_request_id, creative_profile_id, idempotency_key);

CREATE INDEX IF NOT EXISTS creative_mission_response_events_history_idx
  ON creative_mission_response_events (workspace_id, service_request_id, creative_profile_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION prevent_creative_mission_response_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'creative_mission_response_events is immutable';
END;
$$;

DROP TRIGGER IF EXISTS creative_mission_response_events_immutable ON creative_mission_response_events;

CREATE TRIGGER creative_mission_response_events_immutable
  BEFORE UPDATE OR DELETE ON creative_mission_response_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_creative_mission_response_event_mutation();

COMMENT ON TABLE creative_access IS
  'Relation canonique Clerk ↔ creative_profile par workspace, sans dégradation de l accès Admin.';

COMMENT ON TABLE creative_invitations IS
  'Invitation admin d une fiche créative active vers la plateforme KLIQUE OS.';

COMMENT ON TABLE creative_mission_responses IS
  'Projection actuelle de la réponse d un créatif à une mission, sans modifier l affectation admin.';

COMMENT ON TABLE creative_mission_response_events IS
  'Historique append-only des réponses créatives, avec auteur, date, action et note.';

COMMIT;
