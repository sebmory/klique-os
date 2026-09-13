ALTER TABLE klique_visibility_publication_athletes
  ADD COLUMN IF NOT EXISTS is_collaborator BOOLEAN NOT NULL DEFAULT FALSE;