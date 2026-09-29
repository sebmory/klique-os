BEGIN;

ALTER TABLE story_studio_photos
  DROP CONSTRAINT IF EXISTS story_studio_photos_blob_pathname_check,
  DROP CONSTRAINT IF EXISTS story_studio_photos_width_check,
  DROP CONSTRAINT IF EXISTS story_studio_photos_height_check,
  DROP CONSTRAINT IF EXISTS story_studio_photos_size_check;

ALTER TABLE story_studio_photos
  ADD CONSTRAINT story_studio_photos_blob_pathname_check CHECK (
    blob_pathname ~ '^story-studio/photos/.+$'
    OR blob_pathname ~ '^story-studio/brand-kit-logos/.+$'
  ),
  ADD CONSTRAINT story_studio_photos_width_check CHECK (
    (blob_pathname ~ '^story-studio/photos/.+$' AND width_px BETWEEN 320 AND 8192)
    OR (blob_pathname ~ '^story-studio/brand-kit-logos/.+$' AND width_px BETWEEN 128 AND 8192)
  ),
  ADD CONSTRAINT story_studio_photos_height_check CHECK (
    (blob_pathname ~ '^story-studio/photos/.+$' AND height_px BETWEEN 320 AND 8192)
    OR (blob_pathname ~ '^story-studio/brand-kit-logos/.+$' AND height_px BETWEEN 128 AND 8192)
  ),
  ADD CONSTRAINT story_studio_photos_size_check CHECK (
    (blob_pathname ~ '^story-studio/photos/.+$' AND size_bytes BETWEEN 1 AND 26214400)
    OR (blob_pathname ~ '^story-studio/brand-kit-logos/.+$' AND size_bytes BETWEEN 1 AND 26214400)
  );

COMMIT;