BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS content_after_match_packs_workspace_pack_stories_variant_idx
  ON content_after_match_packs (workspace_id, id, stories_variant_id);

CREATE TABLE IF NOT EXISTS story_studio_projects (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  media_id UUID NULL,
  source_pack_id UUID NOT NULL,
  source_stories_variant_id TEXT NOT NULL,
  source_document_id TEXT NOT NULL,
  athlete_id TEXT NULL,
  project_type TEXT NOT NULL DEFAULT 'after_match',
  template_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  payload_json JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT story_studio_projects_workspace_variant_unique
    UNIQUE (workspace_id, source_stories_variant_id),
  CONSTRAINT story_studio_projects_pack_fkey
    FOREIGN KEY (workspace_id, source_pack_id, source_stories_variant_id)
    REFERENCES content_after_match_packs (workspace_id, id, stories_variant_id)
    ON DELETE RESTRICT,
  CONSTRAINT story_studio_projects_variant_fkey
    FOREIGN KEY (workspace_id, source_stories_variant_id)
    REFERENCES content_variants (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT story_studio_projects_document_fkey
    FOREIGN KEY (workspace_id, source_document_id)
    REFERENCES content_documents (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT story_studio_projects_media_fkey
    FOREIGN KEY (workspace_id, media_id)
    REFERENCES media_organizations (workspace_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT story_studio_projects_workspace_check CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT story_studio_projects_user_check CHECK (btrim(user_id) <> ''),
  CONSTRAINT story_studio_projects_source_variant_check CHECK (btrim(source_stories_variant_id) <> ''),
  CONSTRAINT story_studio_projects_source_document_check CHECK (btrim(source_document_id) <> ''),
  CONSTRAINT story_studio_projects_athlete_check CHECK (athlete_id IS NULL OR btrim(athlete_id) <> ''),
  CONSTRAINT story_studio_projects_type_check CHECK (project_type = 'after_match'),
  CONSTRAINT story_studio_projects_template_check
    CHECK (template_key IN ('editorial_klique', 'match_energy', 'minimal_premium')),
  CONSTRAINT story_studio_projects_status_check CHECK (status IN ('draft', 'finalized')),
  CONSTRAINT story_studio_projects_payload_check
    CHECK (
      jsonb_typeof(payload_json) = 'object'
      AND payload_json->>'schemaVersion' = '1'
      AND payload_json->>'templateKey' = template_key
      AND jsonb_typeof(payload_json->'frames') = 'array'
      AND jsonb_array_length(payload_json->'frames') = 4
    ),
  CONSTRAINT story_studio_projects_version_check CHECK (version >= 1),
  CONSTRAINT story_studio_projects_dates_check CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS story_studio_projects_workspace_id_idx
  ON story_studio_projects (workspace_id, id);

CREATE INDEX IF NOT EXISTS story_studio_projects_workspace_pack_idx
  ON story_studio_projects (workspace_id, source_pack_id);

CREATE INDEX IF NOT EXISTS story_studio_projects_media_updated_idx
  ON story_studio_projects (workspace_id, media_id, updated_at DESC);

COMMIT;