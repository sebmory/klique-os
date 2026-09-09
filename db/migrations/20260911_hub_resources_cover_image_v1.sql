ALTER TABLE hub_resources
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT NULL;

ALTER TABLE hub_resources
  DROP CONSTRAINT IF EXISTS hub_resources_cover_image_url_check;

ALTER TABLE hub_resources
  ADD CONSTRAINT hub_resources_cover_image_url_check CHECK (
    cover_image_url IS NULL OR cover_image_url ~ '^https://'
  );

COMMENT ON COLUMN hub_resources.cover_image_url IS
  'URL https facultative de la couverture JPG/PNG de la ressource. NULL si aucune couverture.';
