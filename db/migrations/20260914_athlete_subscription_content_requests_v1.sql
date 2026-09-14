ALTER TABLE athlete_subscriptions
  ADD CONSTRAINT athlete_subscriptions_workspace_id_athlete_id_key
  UNIQUE (workspace_id, id, athlete_id);

CREATE TABLE IF NOT EXISTS athlete_subscription_content_requests (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  subscription_id UUID NOT NULL,
  athlete_id TEXT NOT NULL,
  format_code TEXT NOT NULL CHECK (format_code IN (
    'athlete_announcement',
    'news',
    'performance',
    'portrait',
    'quote',
    'storytelling_carousel',
    'story',
    'reel',
    'editorial_interview',
    'video_interview',
    'partner_activation',
    'behind_the_scenes'
  )),
  status TEXT NOT NULL CHECK (status IN (
    'requested',
    'accepted',
    'in_progress',
    'completed',
    'declined',
    'cancelled'
  )),
  athlete_note TEXT NULL,
  preferred_date DATE NULL,
  admin_note TEXT NULL,
  reserved_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT athlete_subscription_content_requests_subscription_fkey
    FOREIGN KEY (workspace_id, subscription_id, athlete_id)
    REFERENCES athlete_subscriptions (workspace_id, id, athlete_id)
    ON DELETE RESTRICT,
  CHECK (btrim(workspace_id) <> ''),
  CHECK (btrim(athlete_id) <> ''),
  CHECK (btrim(format_code) <> ''),
  CHECK (btrim(status) <> ''),
  CHECK (athlete_note IS NULL OR btrim(athlete_note) <> ''),
  CHECK (admin_note IS NULL OR btrim(admin_note) <> ''),
  CHECK (
    status NOT IN ('accepted', 'in_progress', 'completed')
    OR reserved_at IS NOT NULL
  ),
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS athlete_subscription_content_requests_workspace_idx
  ON athlete_subscription_content_requests (workspace_id);

CREATE INDEX IF NOT EXISTS athlete_subscription_content_requests_subscription_idx
  ON athlete_subscription_content_requests (subscription_id);

CREATE INDEX IF NOT EXISTS athlete_subscription_content_requests_athlete_idx
  ON athlete_subscription_content_requests (athlete_id);

CREATE INDEX IF NOT EXISTS athlete_subscription_content_requests_status_idx
  ON athlete_subscription_content_requests (status);