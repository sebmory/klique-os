BEGIN;

ALTER TABLE story_studio_frame_models
  DROP CONSTRAINT IF EXISTS story_studio_frame_models_workspace_fkey;

COMMIT;