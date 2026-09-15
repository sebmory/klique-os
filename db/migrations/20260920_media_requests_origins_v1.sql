ALTER TABLE media_requests
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'klique_proposal',
  ADD COLUMN IF NOT EXISTS title TEXT NULL;

ALTER TABLE media_requests
  ALTER COLUMN subject_id DROP NOT NULL;

ALTER TABLE media_requests
  DROP CONSTRAINT IF EXISTS media_requests_subject_id_fkey;

ALTER TABLE media_requests
  ADD CONSTRAINT media_requests_subject_id_fkey
  FOREIGN KEY (subject_id) REFERENCES media_subjects (id) ON DELETE RESTRICT;

ALTER TABLE media_requests
  DROP CONSTRAINT IF EXISTS media_requests_origin_check,
  DROP CONSTRAINT IF EXISTS media_requests_title_not_blank,
  DROP CONSTRAINT IF EXISTS media_requests_origin_subject_check;

ALTER TABLE media_requests
  ADD CONSTRAINT media_requests_origin_check CHECK (
    origin IN ('klique_proposal', 'free')
  ),
  ADD CONSTRAINT media_requests_title_not_blank CHECK (
    title IS NULL OR NULLIF(btrim(title), '') IS NOT NULL
  ),
  ADD CONSTRAINT media_requests_origin_subject_check CHECK (
    (origin = 'klique_proposal' AND subject_id IS NOT NULL)
    OR (
      origin = 'free'
      AND subject_id IS NULL
      AND NULLIF(btrim(title), '') IS NOT NULL
    )
  );