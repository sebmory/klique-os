BEGIN;

ALTER TABLE partner_invitations
  ALTER COLUMN clerk_invitation_id DROP NOT NULL,
  ALTER COLUMN invited_by_clerk_user_id DROP NOT NULL;

ALTER TABLE partner_invitations
  ADD COLUMN IF NOT EXISTS clerk_invitation_attempt_id UUID NULL,
  ADD COLUMN IF NOT EXISTS clerk_creation_started_at TIMESTAMPTZ NULL;

ALTER TABLE partner_invitations
  ADD CONSTRAINT partner_invitations_invitation_or_attempt_check
    CHECK (
      clerk_invitation_id IS NOT NULL
      OR clerk_invitation_attempt_id IS NOT NULL
    ),
  ADD CONSTRAINT partner_invitations_creation_attempt_check
    CHECK (
      clerk_creation_started_at IS NULL
      OR clerk_invitation_attempt_id IS NOT NULL
    ),
  ADD CONSTRAINT partner_invitations_unknown_inviter_check
    CHECK (
      invited_by_clerk_user_id IS NOT NULL
      OR (
        status = 'accepted'
        AND clerk_invitation_id IS NOT NULL
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS partner_invitations_attempt_unique_idx
  ON partner_invitations (clerk_invitation_attempt_id)
  WHERE clerk_invitation_attempt_id IS NOT NULL;

COMMIT;
