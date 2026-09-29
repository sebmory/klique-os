BEGIN;

CREATE TABLE IF NOT EXISTS story_studio_frame_models (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  brand_kit_id UUID NULL,
  content_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT story_studio_frame_models_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT story_studio_frame_models_user_check CHECK (btrim(created_by_user_id) <> ''),
  CONSTRAINT story_studio_frame_models_content_check CHECK (
    jsonb_typeof(content_json) = 'object'
    AND content_json->>'schemaVersion' = '1'
    AND content_json->>'canvasFormat' = '1080x1350'
    AND jsonb_typeof(content_json->'frame') = 'object'
    AND NOT ((content_json->'frame') ?| ARRAY['photo', 'matchCard'])
  ),
  CONSTRAINT story_studio_frame_models_brand_kit_check CHECK (
    (brand_kit_id IS NULL AND content_json->'brandKitId' = 'null'::jsonb)
    OR content_json->>'brandKitId' = brand_kit_id::text
  ),
  CONSTRAINT story_studio_frame_models_dates_check CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS story_studio_frame_models_workspace_id_idx
  ON story_studio_frame_models (workspace_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS story_studio_frame_models_workspace_name_idx
  ON story_studio_frame_models (workspace_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS story_studio_frame_models_workspace_updated_idx
  ON story_studio_frame_models (workspace_id, updated_at DESC);

COMMIT;