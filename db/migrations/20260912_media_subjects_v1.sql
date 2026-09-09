CREATE TABLE IF NOT EXISTS media_subjects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  angle TEXT NOT NULL,
  sport TEXT NULL,
  location TEXT NULL,
  subject_date DATE NULL,
  cover_image_url TEXT NULL,
  available_request_types TEXT[] NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ NULL,
  created_by_clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT media_subjects_title_not_blank CHECK (NULLIF(btrim(title), '') IS NOT NULL),
  CONSTRAINT media_subjects_summary_not_blank CHECK (NULLIF(btrim(summary), '') IS NOT NULL),
  CONSTRAINT media_subjects_angle_not_blank CHECK (NULLIF(btrim(angle), '') IS NOT NULL),
  CONSTRAINT media_subjects_cover_image_url_check CHECK (
    cover_image_url IS NULL OR cover_image_url ~ '^https://'
  ),
  CONSTRAINT media_subjects_request_types_check CHECK (
    array_length(available_request_types, 1) >= 1
    AND available_request_types <@ ARRAY['interview', 'reaction', 'reportage', 'images', 'podcast']::TEXT[]
  ),
  CONSTRAINT media_subjects_published_at_check CHECK (
    (status = 'published') = (published_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS media_subjects_workspace_status_idx
  ON media_subjects (workspace_id, status, published_at DESC);

-- Association N-N : un sujet peut concerner plusieurs athletes, un athlete plusieurs sujets.
CREATE TABLE IF NOT EXISTS media_subject_athletes (
  subject_id TEXT NOT NULL REFERENCES media_subjects (id) ON DELETE CASCADE,
  athlete_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (subject_id, athlete_id),
  CONSTRAINT media_subject_athletes_athlete_not_blank CHECK (NULLIF(btrim(athlete_id), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS media_subject_athletes_workspace_athlete_idx
  ON media_subject_athletes (workspace_id, athlete_id);

COMMENT ON TABLE media_subjects IS
  'Sujets proposes au Media Desk. Lecture des sujets publies pour le role media, ecriture reservee a l Admin, isolation stricte par workspace.';

COMMENT ON COLUMN media_subjects.available_request_types IS
  'Types de demandes media ouvertes sur ce sujet : interview, reaction, reportage, images, podcast.';

COMMENT ON COLUMN media_subjects.cover_image_url IS
  'URL https facultative du visuel du sujet. NULL si aucun visuel.';
