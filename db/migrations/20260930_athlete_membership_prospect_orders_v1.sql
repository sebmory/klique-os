BEGIN;

CREATE TABLE IF NOT EXISTS athlete_membership_prospect_orders (
  id UUID PRIMARY KEY,
  public_reference TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,
  clerk_user_id TEXT NOT NULL,
  verified_email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NULL,
  plan_code TEXT NOT NULL,
  plan_name_snapshot TEXT NOT NULL,
  annual_price_chf_snapshot NUMERIC(10, 2) NOT NULL,
  duration_months_snapshot INTEGER NOT NULL,
  production_credits_snapshot INTEGER NOT NULL,
  custom_content_credits_snapshot INTEGER NOT NULL,
  video_allowed_snapshot BOOLEAN NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'twint_business',
  status TEXT NOT NULL DEFAULT 'pending_payment',
  athlete_id TEXT NULL,
  membership_id TEXT NULL,
  created_by_clerk_user_id TEXT NOT NULL,
  confirmed_by_clerk_user_id TEXT NULL,
  activated_by_clerk_user_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  terms_version TEXT NOT NULL,
  terms_accepted_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  paid_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  activated_at TIMESTAMPTZ NULL,
  CONSTRAINT athlete_membership_prospect_orders_plan_fkey
    FOREIGN KEY (plan_code)
    REFERENCES membership_plans (code)
    ON DELETE RESTRICT,
  CONSTRAINT athlete_membership_prospect_orders_membership_fkey
    FOREIGN KEY (workspace_id, membership_id, athlete_id)
    REFERENCES athlete_memberships (workspace_id, id, athlete_id)
    ON DELETE RESTRICT,
  CONSTRAINT athlete_membership_prospect_orders_public_reference_check
    CHECK (public_reference ~ '^KQ-[A-Z0-9]{12}$'),
  CONSTRAINT athlete_membership_prospect_orders_workspace_id_check
    CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT athlete_membership_prospect_orders_clerk_user_id_check
    CHECK (btrim(clerk_user_id) <> ''),
  CONSTRAINT athlete_membership_prospect_orders_verified_email_check
    CHECK (
      btrim(verified_email) <> ''
      AND verified_email = lower(btrim(verified_email))
    ),
  CONSTRAINT athlete_membership_prospect_orders_full_name_check
    CHECK (btrim(full_name) <> ''),
  CONSTRAINT athlete_membership_prospect_orders_phone_check
    CHECK (phone IS NULL OR btrim(phone) <> ''),
  CONSTRAINT athlete_membership_prospect_orders_plan_name_snapshot_check
    CHECK (btrim(plan_name_snapshot) <> ''),
  CONSTRAINT athlete_membership_prospect_orders_annual_price_snapshot_check
    CHECK (annual_price_chf_snapshot >= 0),
  CONSTRAINT athlete_membership_prospect_orders_duration_snapshot_check
    CHECK (duration_months_snapshot > 0),
  CONSTRAINT athlete_membership_prospect_orders_production_credits_snapshot_check
    CHECK (production_credits_snapshot >= 0),
  CONSTRAINT athlete_membership_prospect_orders_custom_content_credits_snapshot_check
    CHECK (custom_content_credits_snapshot >= 0),
  CONSTRAINT athlete_membership_prospect_orders_payment_method_check
    CHECK (payment_method = 'twint_business'),
  CONSTRAINT athlete_membership_prospect_orders_status_check
    CHECK (status IN (
      'pending_payment',
      'paid_awaiting_form',
      'activated',
      'cancelled',
      'expired'
    )),
  CONSTRAINT athlete_membership_prospect_orders_athlete_id_check
    CHECK (athlete_id IS NULL OR btrim(athlete_id) <> ''),
  CONSTRAINT athlete_membership_prospect_orders_created_by_check
    CHECK (btrim(created_by_clerk_user_id) <> ''),
  CONSTRAINT athlete_membership_prospect_orders_confirmed_by_check
    CHECK (
      confirmed_by_clerk_user_id IS NULL
      OR btrim(confirmed_by_clerk_user_id) <> ''
    ),
  CONSTRAINT athlete_membership_prospect_orders_activated_by_check
    CHECK (
      activated_by_clerk_user_id IS NULL
      OR btrim(activated_by_clerk_user_id) <> ''
    ),
  CONSTRAINT athlete_membership_prospect_orders_terms_version_check
    CHECK (btrim(terms_version) <> ''),
  CONSTRAINT athlete_membership_prospect_orders_dates_check
    CHECK (
      updated_at >= created_at
      AND expires_at > created_at
      AND (paid_at IS NULL OR paid_at >= created_at)
      AND (cancelled_at IS NULL OR cancelled_at >= created_at)
      AND (activated_at IS NULL OR activated_at >= created_at)
    ),
  CONSTRAINT athlete_membership_prospect_orders_state_check
    CHECK (
      (
        status = 'pending_payment'
        AND paid_at IS NULL
        AND confirmed_by_clerk_user_id IS NULL
        AND athlete_id IS NULL
        AND membership_id IS NULL
        AND cancelled_at IS NULL
        AND activated_at IS NULL
        AND activated_by_clerk_user_id IS NULL
      )
      OR (
        status = 'paid_awaiting_form'
        AND paid_at IS NOT NULL
        AND confirmed_by_clerk_user_id IS NOT NULL
        AND athlete_id IS NULL
        AND membership_id IS NULL
        AND cancelled_at IS NULL
        AND activated_at IS NULL
        AND activated_by_clerk_user_id IS NULL
      )
      OR (
        status = 'activated'
        AND paid_at IS NOT NULL
        AND confirmed_by_clerk_user_id IS NOT NULL
        AND athlete_id IS NOT NULL
        AND membership_id IS NOT NULL
        AND cancelled_at IS NULL
        AND activated_at IS NOT NULL
        AND activated_by_clerk_user_id IS NOT NULL
      )
      OR (
        status = 'cancelled'
        AND (paid_at IS NULL) = (confirmed_by_clerk_user_id IS NULL)
        AND athlete_id IS NULL
        AND membership_id IS NULL
        AND cancelled_at IS NOT NULL
        AND activated_at IS NULL
        AND activated_by_clerk_user_id IS NULL
      )
      OR (
        status = 'expired'
        AND paid_at IS NULL
        AND confirmed_by_clerk_user_id IS NULL
        AND athlete_id IS NULL
        AND membership_id IS NULL
        AND cancelled_at IS NULL
        AND activated_at IS NULL
        AND activated_by_clerk_user_id IS NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_membership_prospect_orders_live_user_idx
  ON athlete_membership_prospect_orders (workspace_id, clerk_user_id)
  WHERE status IN ('pending_payment', 'paid_awaiting_form');

CREATE UNIQUE INDEX IF NOT EXISTS athlete_membership_prospect_orders_membership_id_idx
  ON athlete_membership_prospect_orders (membership_id)
  WHERE membership_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS athlete_membership_prospect_orders_admin_queue_idx
  ON athlete_membership_prospect_orders (workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS athlete_membership_prospect_orders_user_history_idx
  ON athlete_membership_prospect_orders (workspace_id, clerk_user_id, created_at DESC);

COMMIT;