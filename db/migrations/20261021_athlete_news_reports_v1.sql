BEGIN;

CREATE TABLE IF NOT EXISTS athlete_news_reports (
  id UUID PRIMARY KEY,
  client_request_id UUID NOT NULL,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  submitted_by_clerk_user_id TEXT NOT NULL,
  message TEXT NOT NULL,
  event_date DATE NOT NULL,
  external_url TEXT NULL,
  photo_blob_url TEXT NULL,
  photo_blob_pathname TEXT NULL,
  photo_content_type TEXT NULL,
  photo_size_bytes BIGINT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  version INTEGER NOT NULL DEFAULT 1,
  status_updated_by_clerk_user_id TEXT NOT NULL,
  status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT athlete_news_reports_owner_request_unique
    UNIQUE (workspace_id, submitted_by_clerk_user_id, client_request_id),
  CONSTRAINT athlete_news_reports_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT athlete_news_reports_athlete_check CHECK (btrim(athlete_id) <> ''),
  CONSTRAINT athlete_news_reports_submitter_check CHECK (btrim(submitted_by_clerk_user_id) <> ''),
  CONSTRAINT athlete_news_reports_message_check CHECK (length(btrim(message)) BETWEEN 1 AND 600),
  CONSTRAINT athlete_news_reports_external_url_check
    CHECK (external_url IS NULL OR external_url ~ '^https://'),
  CONSTRAINT athlete_news_reports_status_check
    CHECK (status IN ('new', 'preparing', 'processed')),
  CONSTRAINT athlete_news_reports_version_check CHECK (version >= 1),
  CONSTRAINT athlete_news_reports_photo_url_path_check
    CHECK ((photo_blob_url IS NULL) = (photo_blob_pathname IS NULL)),
  CONSTRAINT athlete_news_reports_photo_url_type_check
    CHECK ((photo_blob_url IS NULL) = (photo_content_type IS NULL)),
  CONSTRAINT athlete_news_reports_photo_url_size_check
    CHECK ((photo_blob_url IS NULL) = (photo_size_bytes IS NULL)),
  CONSTRAINT athlete_news_reports_photo_type_check
    CHECK (
      photo_content_type IS NULL
      OR photo_content_type IN ('image/jpeg', 'image/png', 'image/webp')
    ),
  CONSTRAINT athlete_news_reports_photo_size_check
    CHECK (photo_size_bytes IS NULL OR photo_size_bytes BETWEEN 1 AND 10485760)
);

CREATE INDEX IF NOT EXISTS athlete_news_reports_admin_status_idx
  ON athlete_news_reports (workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS athlete_news_reports_owner_idx
  ON athlete_news_reports (
    workspace_id,
    submitted_by_clerk_user_id,
    athlete_id,
    created_at DESC
  );

COMMIT;
