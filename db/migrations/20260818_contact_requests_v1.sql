CREATE TABLE IF NOT EXISTS contact_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('content_photo', 'support', 'partner_benefit', 'technical', 'other')),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 150),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 3000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_requests_workspace_created_at_idx
  ON contact_requests (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS contact_requests_workspace_athlete_idx
  ON contact_requests (workspace_id, athlete_id);
