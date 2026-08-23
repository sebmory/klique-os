CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  request_group_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  clerk_user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  feature TEXT NOT NULL,
  operation TEXT NOT NULL,
  content_type TEXT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_response_id TEXT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  retry_number INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  error_code TEXT NULL,
  duration_ms INTEGER NULL,
  usage_json JSONB NULL,
  estimated_cost_microusd BIGINT NULL,
  pricing_version TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_workspace_created_at_idx
  ON ai_usage_events (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_events_workspace_user_created_at_idx
  ON ai_usage_events (workspace_id, clerk_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_events_request_group_id_idx
  ON ai_usage_events (request_group_id);

CREATE INDEX IF NOT EXISTS ai_usage_events_workspace_feature_created_at_idx
  ON ai_usage_events (workspace_id, feature, created_at DESC);
