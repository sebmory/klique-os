ALTER TABLE content_documents
  ADD COLUMN media_id UUID NULL;

ALTER TABLE content_documents
  ADD CONSTRAINT content_documents_workspace_media_fkey
  FOREIGN KEY (workspace_id, media_id)
  REFERENCES media_organizations (workspace_id, id)
  ON DELETE RESTRICT;

CREATE INDEX content_documents_workspace_media_updated_at_idx
  ON content_documents (workspace_id, media_id, updated_at DESC);

ALTER TABLE content_generation_sessions
  ADD COLUMN media_id UUID NULL;

ALTER TABLE content_generation_sessions
  ADD CONSTRAINT content_generation_sessions_workspace_media_fkey
  FOREIGN KEY (workspace_id, media_id)
  REFERENCES media_organizations (workspace_id, id)
  ON DELETE RESTRICT;

CREATE INDEX content_generation_sessions_workspace_media_idx
  ON content_generation_sessions (workspace_id, media_id);

ALTER TABLE content_variants
  ADD COLUMN media_id UUID NULL;

ALTER TABLE content_variants
  ADD CONSTRAINT content_variants_workspace_media_fkey
  FOREIGN KEY (workspace_id, media_id)
  REFERENCES media_organizations (workspace_id, id)
  ON DELETE RESTRICT;

CREATE INDEX content_variants_workspace_media_source_document_idx
  ON content_variants (workspace_id, media_id, source_document_id);
