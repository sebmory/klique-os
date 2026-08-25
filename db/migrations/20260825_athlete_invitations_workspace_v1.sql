ALTER TABLE athlete_invitations
  ADD COLUMN IF NOT EXISTS workspace_id TEXT;

UPDATE athlete_invitations
SET workspace_id = 'klique-os'
WHERE workspace_id IS NULL OR btrim(workspace_id) = '';

ALTER TABLE athlete_invitations
  ALTER COLUMN workspace_id SET NOT NULL;
