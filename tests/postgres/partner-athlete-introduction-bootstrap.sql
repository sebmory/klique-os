\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() <> 'klique_intro_test' THEN
    RAISE EXCEPTION
      'REFUS: la base cible % n’est pas klique_intro_test.',
      current_database();
  END IF;
END;
$$;

CREATE TABLE partner_intro_test_guard (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  guard_token TEXT NOT NULL CHECK (char_length(guard_token) >= 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO partner_intro_test_guard (singleton, guard_token)
VALUES (
  TRUE,
  md5(random()::text || clock_timestamp()::text)
    || md5(clock_timestamp()::text || random()::text)
);

CREATE TABLE user_access (
  clerk_user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'athlete', 'partner_expert', 'media')),
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NULL,
  partner_id TEXT NULL,
  media_id TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NULLIF(btrim(clerk_user_id), '') IS NOT NULL),
  CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL)
);

CREATE INDEX user_access_workspace_role_status_idx
  ON user_access (workspace_id, role, status);

CREATE UNIQUE INDEX user_access_active_athlete_unique_idx
  ON user_access (workspace_id, athlete_id)
  WHERE role = 'athlete'
    AND status = 'active'
    AND athlete_id IS NOT NULL;

CREATE TABLE contact_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  partner_id TEXT NULL,
  request_kind TEXT NOT NULL DEFAULT 'athlete_contact',
  category TEXT NOT NULL CHECK (
    category IN ('content_photo', 'support', 'partner_benefit', 'technical', 'other')
  ),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 150),
  message TEXT NOT NULL CHECK (char_length(message) <= 3000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'pending', 'in_progress', 'resolved')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contact_requests_request_kind_check
    CHECK (request_kind IN ('athlete_contact', 'partner_athlete_introduction')),
  CONSTRAINT contact_requests_partner_identity_check
    CHECK (
      (request_kind = 'athlete_contact' AND partner_id IS NULL)
      OR (request_kind = 'partner_athlete_introduction' AND partner_id IS NOT NULL)
    )
);

CREATE INDEX contact_requests_workspace_created_at_idx
  ON contact_requests (workspace_id, created_at DESC);

CREATE INDEX contact_requests_workspace_athlete_idx
  ON contact_requests (workspace_id, athlete_id);

CREATE INDEX contact_requests_workspace_partner_idx
  ON contact_requests (workspace_id, partner_id)
  WHERE partner_id IS NOT NULL;

CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  recipient_clerk_user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NULL,
  action_href TEXT NOT NULL,
  read_at TIMESTAMPTZ NULL,
  source_type TEXT NULL,
  source_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (btrim(workspace_id) <> ''),
  CHECK (btrim(recipient_clerk_user_id) <> ''),
  CHECK (btrim(type) <> ''),
  CHECK (btrim(title) <> ''),
  CHECK (body IS NULL OR btrim(body) <> ''),
  CHECK (
    btrim(action_href) <> ''
    AND action_href LIKE '/%'
    AND action_href NOT LIKE '//%'
  ),
  CHECK (
    (source_type IS NULL AND source_id IS NULL)
    OR (
      source_type IS NOT NULL
      AND source_id IS NOT NULL
      AND btrim(source_type) <> ''
      AND btrim(source_id) <> ''
    )
  )
);

CREATE INDEX notifications_recipient_created_at_idx
  ON notifications (workspace_id, recipient_clerk_user_id, created_at DESC);

CREATE INDEX notifications_recipient_unread_created_at_idx
  ON notifications (workspace_id, recipient_clerk_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE UNIQUE INDEX notifications_recipient_source_unique
  ON notifications (workspace_id, recipient_clerk_user_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
