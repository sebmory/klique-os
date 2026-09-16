ALTER TABLE hub_resources
  ADD COLUMN IF NOT EXISTS workspace_id TEXT;

UPDATE hub_resources
SET workspace_id = 'klique-os'
WHERE workspace_id IS NULL OR btrim(workspace_id) = '';

ALTER TABLE hub_resources
  ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS hub_resources_workspace_status_created_at_id_idx
  ON hub_resources (workspace_id, status, created_at DESC, id DESC);