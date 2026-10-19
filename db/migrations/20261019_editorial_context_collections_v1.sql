BEGIN;

CREATE TABLE IF NOT EXISTS editorial_context_collections (
  collection_id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  clerk_user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'media')),
  media_id UUID NULL,
  items_json JSONB NOT NULL,
  reports_json JSONB NOT NULL,
  summary_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT editorial_context_collections_media_fkey
    FOREIGN KEY (workspace_id, media_id)
    REFERENCES media_organizations (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT editorial_context_collections_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT editorial_context_collections_user_check CHECK (btrim(clerk_user_id) <> ''),
  CONSTRAINT editorial_context_collections_owner_check CHECK (
    (role = 'admin' AND media_id IS NULL)
    OR (role = 'media' AND media_id IS NOT NULL)
  ),
  CONSTRAINT editorial_context_collections_items_check CHECK (jsonb_typeof(items_json) = 'array'),
  CONSTRAINT editorial_context_collections_reports_check CHECK (jsonb_typeof(reports_json) = 'array'),
  CONSTRAINT editorial_context_collections_summary_check CHECK (jsonb_typeof(summary_json) = 'object'),
  CONSTRAINT editorial_context_collections_expiry_check CHECK (
    expires_at > created_at
    AND expires_at <= created_at + INTERVAL '30 minutes'
  )
);

CREATE INDEX IF NOT EXISTS editorial_context_collections_access_idx
  ON editorial_context_collections (
    workspace_id,
    clerk_user_id,
    role,
    media_id,
    expires_at DESC
  );

CREATE INDEX IF NOT EXISTS editorial_context_collections_expiry_idx
  ON editorial_context_collections (expires_at);

CREATE OR REPLACE FUNCTION prevent_editorial_context_collection_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'editorial_context_collections rows are immutable after creation';
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'editorial_context_collections_prevent_update'
      AND tgrelid = 'editorial_context_collections'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER editorial_context_collections_prevent_update
      BEFORE UPDATE ON editorial_context_collections
      FOR EACH ROW
      EXECUTE FUNCTION prevent_editorial_context_collection_update();
  END IF;
END;
$$;

COMMIT;
