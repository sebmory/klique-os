BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS creative_profiles_workspace_normalized_email_idx
  ON creative_profiles (workspace_id, lower(btrim(contact_email)))
  WHERE NULLIF(btrim(contact_email), '') IS NOT NULL;

WITH pending_profiles AS (
  SELECT
    profile.workspace_id,
    profile.id,
    profile.onboarding_status,
    invitation.id AS invitation_id,
    invitation.invited_by_clerk_user_id
  FROM creative_profiles profile
  JOIN creative_invitations invitation
    ON invitation.workspace_id = profile.workspace_id
   AND invitation.creative_profile_id = profile.id
   AND invitation.status = 'invited'
  WHERE NOT EXISTS (
    SELECT 1
    FROM creative_access access
    WHERE access.workspace_id = profile.workspace_id
      AND access.creative_profile_id = profile.id
      AND access.status = 'active'
  )
),
updated_profiles AS (
  UPDATE creative_profiles profile
  SET onboarding_status = 'invitation_sent',
      onboarding_submitted_at = NULL,
      onboarding_validated_at = NULL,
      updated_at = NOW()
  FROM pending_profiles pending
  WHERE profile.workspace_id = pending.workspace_id
    AND profile.id = pending.id
    AND profile.onboarding_status IS DISTINCT FROM 'invitation_sent'
  RETURNING
    profile.workspace_id,
    profile.id,
    pending.onboarding_status AS previous_onboarding_status,
    pending.invitation_id,
    pending.invited_by_clerk_user_id
)
INSERT INTO creative_onboarding_events (
  workspace_id,
  creative_profile_id,
  event_type,
  from_status,
  to_status,
  actor_clerk_user_id,
  details
)
SELECT
  workspace_id,
  id,
  'pending_invitation_reconciled',
  previous_onboarding_status,
  'invitation_sent',
  invited_by_clerk_user_id,
  jsonb_build_object('invitationId', invitation_id)
FROM updated_profiles;

COMMIT;
