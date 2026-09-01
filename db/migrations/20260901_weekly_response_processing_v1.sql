CREATE TABLE IF NOT EXISTS weekly_response_processing (
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  response_timestamp TEXT NOT NULL,
  processed_by_clerk_user_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, athlete_id, response_timestamp)
);

CREATE INDEX IF NOT EXISTS weekly_response_processing_workspace_processed_at_idx
  ON weekly_response_processing (workspace_id, processed_at DESC);