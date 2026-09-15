-- Provisionnement ulterieur attendu : id 'elfic-fribourg', nom 'Elfic Fribourg'. Aucun seed volontaire.
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'club',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspaces_id_not_blank CHECK (NULLIF(btrim(id), '') IS NOT NULL),
  CONSTRAINT workspaces_id_format_check CHECK (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT workspaces_name_not_blank CHECK (NULLIF(btrim(name), '') IS NOT NULL),
  CONSTRAINT workspaces_type_check CHECK (type IN ('club')),
  CONSTRAINT workspaces_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS workspaces_type_status_idx
  ON workspaces (type, status);

CREATE INDEX IF NOT EXISTS workspaces_name_idx
  ON workspaces (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited',
  invited_by_clerk_user_id TEXT NOT NULL,
  clerk_invitation_id TEXT NULL,
  accepted_clerk_user_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  CONSTRAINT workspace_invitations_workspace_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT workspace_invitations_workspace_id_id_key UNIQUE (workspace_id, id),
  CONSTRAINT workspace_invitations_membership_identity_key
    UNIQUE (workspace_id, id, accepted_clerk_user_id, role),
  CONSTRAINT workspace_invitations_workspace_id_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT workspace_invitations_email_not_blank
    CHECK (NULLIF(btrim(email), '') IS NOT NULL),
  CONSTRAINT workspace_invitations_email_check
    CHECK (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT workspace_invitations_role_check
    CHECK (role IN ('club_admin', 'club_staff')),
  CONSTRAINT workspace_invitations_status_check
    CHECK (status IN ('invited', 'active', 'revoked')),
  CONSTRAINT workspace_invitations_invited_by_not_blank
    CHECK (NULLIF(btrim(invited_by_clerk_user_id), '') IS NOT NULL),
  CONSTRAINT workspace_invitations_clerk_invitation_id_not_blank
    CHECK (clerk_invitation_id IS NULL OR NULLIF(btrim(clerk_invitation_id), '') IS NOT NULL),
  CONSTRAINT workspace_invitations_accepted_clerk_user_id_not_blank
    CHECK (accepted_clerk_user_id IS NULL OR NULLIF(btrim(accepted_clerk_user_id), '') IS NOT NULL),
  CONSTRAINT workspace_invitations_status_dates_check CHECK (
    (
      status = 'invited'
      AND accepted_clerk_user_id IS NULL
      AND accepted_at IS NULL
      AND revoked_at IS NULL
    )
    OR (
      status = 'active'
      AND accepted_clerk_user_id IS NOT NULL
      AND accepted_at IS NOT NULL
      AND revoked_at IS NULL
    )
    OR (
      status = 'revoked'
      AND accepted_clerk_user_id IS NULL
      AND accepted_at IS NULL
      AND revoked_at IS NOT NULL
    )
  ),
  CONSTRAINT workspace_invitations_expiry_check
    CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitations_workspace_email_invited_unique
  ON workspace_invitations (workspace_id, lower(btrim(email)))
  WHERE status = 'invited';

CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitations_clerk_invitation_id_unique
  ON workspace_invitations (clerk_invitation_id)
  WHERE clerk_invitation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS workspace_invitations_workspace_status_idx
  ON workspace_invitations (workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_invitations_email_status_idx
  ON workspace_invitations (lower(btrim(email)), status);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  clerk_user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  invitation_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL,
  CONSTRAINT workspace_memberships_workspace_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT workspace_memberships_invitation_fkey
    FOREIGN KEY (workspace_id, invitation_id, clerk_user_id, role)
    REFERENCES workspace_invitations (workspace_id, id, accepted_clerk_user_id, role)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT workspace_memberships_workspace_id_id_key UNIQUE (workspace_id, id),
  CONSTRAINT workspace_memberships_workspace_user_key UNIQUE (workspace_id, clerk_user_id),
  CONSTRAINT workspace_memberships_workspace_id_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT workspace_memberships_clerk_user_id_not_blank
    CHECK (NULLIF(btrim(clerk_user_id), '') IS NOT NULL),
  CONSTRAINT workspace_memberships_role_check
    CHECK (role IN ('club_admin', 'club_staff')),
  CONSTRAINT workspace_memberships_status_check
    CHECK (status IN ('active', 'inactive', 'revoked')),
  CONSTRAINT workspace_memberships_status_dates_check CHECK (
    (status IN ('active', 'inactive') AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS workspace_memberships_workspace_status_idx
  ON workspace_memberships (workspace_id, status, role);

CREATE INDEX IF NOT EXISTS workspace_memberships_user_status_idx
  ON workspace_memberships (clerk_user_id, status, workspace_id);

CREATE INDEX IF NOT EXISTS workspace_memberships_invitation_idx
  ON workspace_memberships (workspace_id, invitation_id)
  WHERE invitation_id IS NOT NULL;