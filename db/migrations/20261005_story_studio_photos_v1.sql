BEGIN;

CREATE TABLE IF NOT EXISTS story_studio_photos (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  media_id UUID NULL,
  athlete_id TEXT NULL,
  blob_url TEXT NOT NULL,
  blob_pathname TEXT NOT NULL,
  content_type TEXT NOT NULL,
  width_px INTEGER NOT NULL,
  height_px INTEGER NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT story_studio_photos_blob_url_unique UNIQUE (blob_url),
  CONSTRAINT story_studio_photos_blob_pathname_unique UNIQUE (blob_pathname),
  CONSTRAINT story_studio_photos_media_fkey
    FOREIGN KEY (workspace_id, media_id)
    REFERENCES media_organizations (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT story_studio_photos_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT story_studio_photos_user_check CHECK (btrim(user_id) <> ''),
  CONSTRAINT story_studio_photos_athlete_check CHECK (athlete_id IS NULL OR btrim(athlete_id) <> ''),
  CONSTRAINT story_studio_photos_blob_url_check
    CHECK (blob_url ~ '^https://[^/]+\.blob\.vercel-storage\.com/'),
  CONSTRAINT story_studio_photos_blob_pathname_check CHECK (blob_pathname ~ '^story-studio/photos/'),
  CONSTRAINT story_studio_photos_content_type_check
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT story_studio_photos_width_check CHECK (width_px BETWEEN 320 AND 8192),
  CONSTRAINT story_studio_photos_height_check CHECK (height_px BETWEEN 320 AND 8192),
  CONSTRAINT story_studio_photos_size_check CHECK (size_bytes BETWEEN 1 AND 10485760)
);

CREATE UNIQUE INDEX IF NOT EXISTS story_studio_photos_workspace_id_idx
  ON story_studio_photos (workspace_id, id);

CREATE INDEX IF NOT EXISTS story_studio_photos_owner_created_idx
  ON story_studio_photos (workspace_id, user_id, media_id, created_at DESC);

CREATE INDEX IF NOT EXISTS story_studio_photos_athlete_created_idx
  ON story_studio_photos (workspace_id, athlete_id, created_at DESC)
  WHERE athlete_id IS NOT NULL;

COMMIT;