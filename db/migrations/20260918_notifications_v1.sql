CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  recipient_clerk_user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NULL,
  action_href TEXT NOT NULL,
  read_at TIMESTAMPTZ NULL,
  source_type TEXT NULL,
  source_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (btrim(workspace_id) <> ''),
  CHECK (btrim(recipient_clerk_user_id) <> ''),
  CHECK (btrim(type) <> ''),
  CHECK (btrim(title) <> ''),
  CHECK (body IS NULL OR btrim(body) <> ''),
  CHECK (
    btrim(action_href) <> ''
    AND action_href LIKE '/%'
    AND action_href NOT LIKE '//%'
  ),
  CHECK (
    (source_type IS NULL AND source_id IS NULL)
    OR (
      source_type IS NOT NULL
      AND source_id IS NOT NULL
      AND btrim(source_type) <> ''
      AND btrim(source_id) <> ''
    )
  )
);

CREATE INDEX IF NOT EXISTS notifications_recipient_created_at_idx
  ON notifications (workspace_id, recipient_clerk_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_created_at_idx
  ON notifications (workspace_id, recipient_clerk_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_recipient_source_unique
  ON notifications (workspace_id, recipient_clerk_user_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;