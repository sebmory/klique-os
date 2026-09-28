BEGIN;

ALTER TABLE story_studio_photos
  DROP CONSTRAINT IF EXISTS story_studio_photos_size_check;

ALTER TABLE story_studio_photos
  ADD CONSTRAINT story_studio_photos_size_check
  CHECK (size_bytes BETWEEN 1 AND 26214400);

COMMIT;
