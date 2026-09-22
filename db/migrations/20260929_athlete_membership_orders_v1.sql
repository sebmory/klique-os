BEGIN;

CREATE TABLE IF NOT EXISTS athlete_membership_orders (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  public_reference TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  plan_name_snapshot TEXT NOT NULL,
  annual_price_chf_snapshot NUMERIC(10, 2) NOT NULL,
  duration_months_snapshot INTEGER NOT NULL,
  production_credits_snapshot INTEGER NOT NULL,
  custom_content_credits_snapshot INTEGER NOT NULL,
  video_allowed_snapshot BOOLEAN NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'twint_business',
  status TEXT NOT NULL DEFAULT 'pending',
  membership_id TEXT NULL,
  created_by_clerk_user_id TEXT NOT NULL,
  confirmed_by_clerk_user_id TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  paid_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT athlete_membership_orders_plan_fkey
    FOREIGN KEY (plan_code)
    REFERENCES membership_plans (code)
    ON DELETE RESTRICT,
  CONSTRAINT athlete_membership_orders_membership_fkey
    FOREIGN KEY (workspace_id, membership_id, athlete_id)
    REFERENCES athlete_memberships (workspace_id, id, athlete_id)
    ON DELETE RESTRICT,
  CONSTRAINT athlete_membership_orders_public_reference_check
    CHECK (public_reference ~ '^KQ-[A-Z0-9]{12}$'),
  CONSTRAINT athlete_membership_orders_payment_method_check
    CHECK (payment_method = 'twint_business'),
  CONSTRAINT athlete_membership_orders_status_check
    CHECK (status IN ('pending', 'paid', 'cancelled', 'expired')),
  CONSTRAINT athlete_membership_orders_workspace_id_check
    CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT athlete_membership_orders_athlete_id_check
    CHECK (btrim(athlete_id) <> ''),
  CONSTRAINT athlete_membership_orders_plan_name_snapshot_check
    CHECK (btrim(plan_name_snapshot) <> ''),
  CONSTRAINT athlete_membership_orders_annual_price_snapshot_check
    CHECK (annual_price_chf_snapshot >= 0),
  CONSTRAINT athlete_membership_orders_duration_snapshot_check
    CHECK (duration_months_snapshot > 0),
  CONSTRAINT athlete_membership_orders_production_credits_snapshot_check
    CHECK (production_credits_snapshot >= 0),
  CONSTRAINT athlete_membership_orders_custom_content_credits_snapshot_check
    CHECK (custom_content_credits_snapshot >= 0),
  CONSTRAINT athlete_membership_orders_created_by_check
    CHECK (btrim(created_by_clerk_user_id) <> ''),
  CONSTRAINT athlete_membership_orders_confirmed_by_check
    CHECK (
      confirmed_by_clerk_user_id IS NULL
      OR btrim(confirmed_by_clerk_user_id) <> ''
    ),
  CONSTRAINT athlete_membership_orders_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT athlete_membership_orders_payment_state_check
    CHECK (
      (
        status = 'paid'
        AND membership_id IS NOT NULL
        AND paid_at IS NOT NULL
        AND confirmed_by_clerk_user_id IS NOT NULL
        AND cancelled_at IS NULL
      )
      OR (
        status = 'cancelled'
        AND membership_id IS NULL
        AND paid_at IS NULL
        AND confirmed_by_clerk_user_id IS NULL
        AND cancelled_at IS NOT NULL
      )
      OR (
        status IN ('pending', 'expired')
        AND membership_id IS NULL
        AND paid_at IS NULL
        AND confirmed_by_clerk_user_id IS NULL
        AND cancelled_at IS NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_membership_orders_public_reference_idx
  ON athlete_membership_orders (public_reference);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_membership_orders_pending_workspace_athlete_idx
  ON athlete_membership_orders (workspace_id, athlete_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS athlete_membership_orders_admin_queue_idx
  ON athlete_membership_orders (workspace_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_membership_orders_membership_id_idx
  ON athlete_membership_orders (membership_id)
  WHERE membership_id IS NOT NULL;

COMMIT;