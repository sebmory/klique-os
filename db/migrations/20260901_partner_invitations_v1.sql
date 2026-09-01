CREATE TABLE IF NOT EXISTS partner_invitations (
  partner_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  email TEXT NOT NULL,
  clerk_invitation_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'revoked')),
  invited_by_clerk_user_id TEXT NOT NULL,
  accepted_clerk_user_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_invitations_workspace_email_pending_unique
  ON partner_invitations (workspace_id, lower(btrim(email)))
  WHERE status = 'invited';

CREATE INDEX IF NOT EXISTS partner_invitations_email_status_idx
  ON partner_invitations (lower(btrim(email)), status);