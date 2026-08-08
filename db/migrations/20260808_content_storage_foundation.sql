CREATE TABLE IF NOT EXISTS content_documents (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_json JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT content_documents_workspace_id_id_unique UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS content_documents_workspace_id_updated_at_idx
  ON content_documents (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS content_generation_sessions (
  session_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  payload_json JSONB NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS content_generation_sessions_workspace_id_session_id_idx
  ON content_generation_sessions (workspace_id, session_id);

CREATE INDEX IF NOT EXISTS content_generation_sessions_expires_at_idx
  ON content_generation_sessions (expires_at);

CREATE TABLE IF NOT EXISTS content_variants (
  id TEXT NOT NULL,
  source_document_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_json JSONB NOT NULL,
  CONSTRAINT content_variants_workspace_id_id_unique UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS content_variants_workspace_id_source_document_id_idx
  ON content_variants (workspace_id, source_document_id);
