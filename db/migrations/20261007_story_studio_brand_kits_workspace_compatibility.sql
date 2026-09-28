BEGIN;

ALTER TABLE story_studio_brand_kits
  DROP CONSTRAINT IF EXISTS story_studio_brand_kits_workspace_fkey;

COMMIT;