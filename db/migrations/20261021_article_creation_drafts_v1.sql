BEGIN;

CREATE TABLE IF NOT EXISTS article_creation_drafts (
  id UUID PRIMARY KEY,
  client_creation_id UUID NOT NULL,
  workspace_id TEXT NOT NULL,
  clerk_user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'media')),
  media_id UUID NULL,
  content_type TEXT NOT NULL DEFAULT 'article',
  display_title TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  step_id TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT article_creation_drafts_media_fkey
    FOREIGN KEY (workspace_id, media_id)
    REFERENCES media_organizations (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT article_creation_drafts_owner_unique
    UNIQUE (workspace_id, clerk_user_id, client_creation_id),
  CONSTRAINT article_creation_drafts_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT article_creation_drafts_user_check CHECK (btrim(clerk_user_id) <> ''),
  CONSTRAINT article_creation_drafts_title_check CHECK (btrim(display_title) <> ''),
  CONSTRAINT article_creation_drafts_subject_check CHECK (btrim(subject_name) <> ''),
  CONSTRAINT article_creation_drafts_step_check CHECK (
    step_id IN ('subject', 'objective', 'parameters', 'context', 'angle', 'structure', 'summary')
  ),
  CONSTRAINT article_creation_drafts_owner_check CHECK (
    (role = 'admin' AND media_id IS NULL)
    OR (role = 'media' AND media_id IS NOT NULL)
  ),
  CONSTRAINT article_creation_drafts_content_type_check CHECK (content_type = 'article'),
  CONSTRAINT article_creation_drafts_schema_check CHECK (schema_version = 1),
  CONSTRAINT article_creation_drafts_version_check CHECK (version >= 1),
  CONSTRAINT article_creation_drafts_payload_check CHECK (jsonb_typeof(payload_json) = 'object'),
  CONSTRAINT article_creation_drafts_dates_check CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS article_creation_drafts_owner_updated_idx
  ON article_creation_drafts (
    workspace_id,
    clerk_user_id,
    role,
    media_id,
    updated_at DESC
  )
  WHERE deleted_at IS NULL;

COMMIT;
