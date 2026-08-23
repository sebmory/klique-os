CREATE TABLE IF NOT EXISTS ai_credit_periods (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  clerk_user_id TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  credits_granted INTEGER NOT NULL CHECK (credits_granted >= 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_start < period_end),
  UNIQUE (workspace_id, clerk_user_id, period_start)
);

CREATE TABLE IF NOT EXISTS ai_credit_transactions (
  id UUID PRIMARY KEY,
  period_id UUID NOT NULL REFERENCES ai_credit_periods (id) ON DELETE RESTRICT,
  workspace_id TEXT NOT NULL,
  clerk_user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('consumption', 'adjustment', 'refund')),
  credit_delta INTEGER NOT NULL CHECK (credit_delta <> 0),
  request_group_id TEXT NULL,
  operation TEXT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (kind = 'consumption' AND credit_delta < 0)
    OR (kind = 'refund' AND credit_delta > 0)
    OR (kind = 'adjustment')
  ),
  UNIQUE (workspace_id, clerk_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ai_credit_periods_workspace_user_period_idx
  ON ai_credit_periods (workspace_id, clerk_user_id, period_start DESC);

CREATE INDEX IF NOT EXISTS ai_credit_transactions_period_id_idx
  ON ai_credit_transactions (period_id);

CREATE INDEX IF NOT EXISTS ai_credit_transactions_request_group_id_idx
  ON ai_credit_transactions (request_group_id);
