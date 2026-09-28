BEGIN;

CREATE TABLE IF NOT EXISTS story_studio_brand_kits (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  primary_color TEXT NOT NULL,
  secondary_color TEXT NOT NULL,
  accent_color TEXT NOT NULL,
  text_color TEXT NOT NULL,
  muted_text_color TEXT NOT NULL,
  light_logo_photo_id UUID NULL,
  dark_logo_photo_id UUID NULL,
  font_family TEXT NOT NULL,
  signature_mode TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT story_studio_brand_kits_workspace_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT story_studio_brand_kits_light_logo_fkey
    FOREIGN KEY (workspace_id, light_logo_photo_id)
    REFERENCES story_studio_photos (workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT story_studio_brand_kits_dark_logo_fkey
    FOREIGN KEY (workspace_id, dark_logo_photo_id)
    REFERENCES story_studio_photos (workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT story_studio_brand_kits_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT story_studio_brand_kits_primary_color_check CHECK (primary_color ~ '^#[0-9A-F]{6}$'),
  CONSTRAINT story_studio_brand_kits_secondary_color_check CHECK (secondary_color ~ '^#[0-9A-F]{6}$'),
  CONSTRAINT story_studio_brand_kits_accent_color_check CHECK (accent_color ~ '^#[0-9A-F]{6}$'),
  CONSTRAINT story_studio_brand_kits_text_color_check CHECK (text_color ~ '^#[0-9A-F]{6}$'),
  CONSTRAINT story_studio_brand_kits_muted_text_color_check CHECK (muted_text_color ~ '^#[0-9A-F]{6}$'),
  CONSTRAINT story_studio_brand_kits_font_check
    CHECK (font_family IN ('Arial', 'Georgia', 'Impact', 'Times New Roman')),
  CONSTRAINT story_studio_brand_kits_signature_check
    CHECK (signature_mode IN ('visible', 'discreet', 'hidden')),
  CONSTRAINT story_studio_brand_kits_dates_check CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS story_studio_brand_kits_workspace_id_idx
  ON story_studio_brand_kits (workspace_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS story_studio_brand_kits_workspace_name_idx
  ON story_studio_brand_kits (workspace_id, lower(btrim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS story_studio_brand_kits_workspace_default_idx
  ON story_studio_brand_kits (workspace_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS story_studio_brand_kits_workspace_updated_idx
  ON story_studio_brand_kits (workspace_id, updated_at DESC);

COMMIT;