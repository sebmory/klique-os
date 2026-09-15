CREATE TABLE media_organizations (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  website TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT media_organizations_workspace_id_id_key UNIQUE (workspace_id, id),
  CONSTRAINT media_organizations_workspace_id_not_blank CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT media_organizations_name_not_blank CHECK (NULLIF(btrim(name), '') IS NOT NULL),
  CONSTRAINT media_organizations_type_not_blank CHECK (NULLIF(btrim(type), '') IS NOT NULL),
  CONSTRAINT media_organizations_type_check CHECK (
    type IN ('media_outlet', 'journalist', 'agency', 'creator', 'other')
  ),
  CONSTRAINT media_organizations_contact_email_not_blank CHECK (
    NULLIF(btrim(contact_email), '') IS NOT NULL
  ),
  CONSTRAINT media_organizations_contact_email_check CHECK (
    contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT media_organizations_website_check CHECK (
    website IS NULL
    OR (
      NULLIF(btrim(website), '') IS NOT NULL
      AND website ~* '^https?://[^[:space:]]+$'
    )
  ),
  CONSTRAINT media_organizations_status_not_blank CHECK (NULLIF(btrim(status), '') IS NOT NULL),
  CONSTRAINT media_organizations_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX media_organizations_workspace_idx
  ON media_organizations (workspace_id);

CREATE INDEX media_organizations_status_idx
  ON media_organizations (status);

CREATE INDEX media_organizations_name_idx
  ON media_organizations (lower(btrim(name)));

ALTER TABLE media_invitations
  ADD COLUMN media_id UUID NULL;

ALTER TABLE media_invitations
  ADD CONSTRAINT media_invitations_workspace_media_fkey
  FOREIGN KEY (workspace_id, media_id)
  REFERENCES media_organizations (workspace_id, id)
  ON DELETE RESTRICT;