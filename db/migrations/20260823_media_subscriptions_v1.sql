CREATE TABLE IF NOT EXISTS media_subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  clerk_user_id TEXT NOT NULL,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('beta_partner', 'essential', 'editorial', 'media')),
  status TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  billing_provider TEXT NOT NULL CHECK (billing_provider IN ('manual', 'stripe')),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('CHF')),
  credits_per_period INTEGER NOT NULL CHECK (credits_per_period >= 0),
  interval TEXT NOT NULL CHECK (interval IN ('month')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  provider_customer_id TEXT NULL,
  provider_subscription_id TEXT NULL,
  canceled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (current_period_start < current_period_end),
  UNIQUE (workspace_id, clerk_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS media_subscriptions_provider_subscription_id_idx
  ON media_subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS media_subscriptions_workspace_status_idx
  ON media_subscriptions (workspace_id, status);

CREATE INDEX IF NOT EXISTS media_subscriptions_current_period_end_idx
  ON media_subscriptions (current_period_end);

CREATE INDEX IF NOT EXISTS media_subscriptions_provider_customer_id_idx
  ON media_subscriptions (provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;
