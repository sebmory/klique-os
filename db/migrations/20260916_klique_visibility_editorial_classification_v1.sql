-- Qualification editoriale complementaire des publications suivies.
ALTER TABLE klique_visibility_publications
  ADD COLUMN IF NOT EXISTS title TEXT NULL,
  ADD COLUMN IF NOT EXISTS editorial_category TEXT NOT NULL DEFAULT 'legacy_unclassified';

ALTER TABLE klique_visibility_publications
  DROP CONSTRAINT IF EXISTS klique_visibility_publications_title_check;

ALTER TABLE klique_visibility_publications
  ADD CONSTRAINT klique_visibility_publications_title_check CHECK (
    title IS NULL OR btrim(title) <> ''
  );

ALTER TABLE klique_visibility_publications
  DROP CONSTRAINT IF EXISTS klique_visibility_publications_editorial_category_check;

ALTER TABLE klique_visibility_publications
  ADD CONSTRAINT klique_visibility_publications_editorial_category_check CHECK (
    editorial_category IN (
      'legacy_unclassified',
      'athlete_welcome',
      'photo_gallery',
      'athlete_of_month',
      'interview',
      'portrait',
      'performance',
      'media_day',
      'news',
      'partner_expert',
      'behind_the_scenes',
      'event',
      'other'
    )
  );

COMMENT ON COLUMN klique_visibility_publications.title IS
  'Titre editorial facultatif de la publication suivie.';

COMMENT ON COLUMN klique_visibility_publications.editorial_category IS
  'Categorie editoriale de la publication; les publications historiques restent non classees par defaut.';