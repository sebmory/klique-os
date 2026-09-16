ALTER TABLE community_publications
  ADD COLUMN IF NOT EXISTS workspace_id TEXT;

UPDATE community_publications
SET workspace_id = 'klique-os'
WHERE workspace_id IS NULL OR btrim(workspace_id) = '';

ALTER TABLE community_publications
  ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS community_publications_workspace_created_at_id_idx
  ON community_publications (workspace_id, created_at DESC, id DESC);
