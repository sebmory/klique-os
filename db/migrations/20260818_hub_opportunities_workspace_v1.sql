ALTER TABLE hub_opportunities
  ADD COLUMN IF NOT EXISTS workspace_id TEXT;

UPDATE hub_opportunities
SET workspace_id = 'klique-os'
WHERE workspace_id IS NULL OR btrim(workspace_id) = '';

ALTER TABLE hub_opportunities
  ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS hub_opportunities_workspace_status_created_at_idx
  ON hub_opportunities (workspace_id, status, created_at DESC);
