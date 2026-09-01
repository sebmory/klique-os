ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS annual_price_chf NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS monthly_installment_chf NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS production_credits INTEGER,
  ADD COLUMN IF NOT EXISTS custom_content_credits INTEGER,
  ADD COLUMN IF NOT EXISTS video_allowed BOOLEAN;

ALTER TABLE membership_plans
  ADD CONSTRAINT membership_plans_annual_price_check
    CHECK (annual_price_chf IS NULL OR annual_price_chf >= 0),
  ADD CONSTRAINT membership_plans_monthly_installment_check
    CHECK (monthly_installment_chf IS NULL OR monthly_installment_chf >= 0),
  ADD CONSTRAINT membership_plans_production_credits_check
    CHECK (production_credits IS NULL OR production_credits >= 0),
  ADD CONSTRAINT membership_plans_custom_content_credits_check
    CHECK (custom_content_credits IS NULL OR custom_content_credits >= 0);

CREATE TABLE IF NOT EXISTS athlete_credit_movements (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  membership_id TEXT NULL REFERENCES athlete_memberships (id) ON DELETE RESTRICT,
  credit_type TEXT NOT NULL CHECK (credit_type IN ('production', 'custom_content')),
  quantity INTEGER NOT NULL CHECK (quantity <> 0),
  source TEXT NOT NULL CHECK (source IN ('plan_grant', 'admin_adjustment', 'purchase', 'usage')),
  reference_id TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (btrim(workspace_id) <> ''),
  CHECK (btrim(athlete_id) <> ''),
  CHECK (reference_id IS NULL OR btrim(reference_id) <> ''),
  CHECK (
    (source IN ('plan_grant', 'purchase') AND quantity > 0)
    OR (source = 'usage' AND quantity < 0)
    OR source = 'admin_adjustment'
  ),
  CHECK (source NOT IN ('plan_grant', 'purchase') OR expires_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS athlete_credit_movements_workspace_athlete_type_idx
  ON athlete_credit_movements (workspace_id, athlete_id, credit_type, created_at DESC);

CREATE INDEX IF NOT EXISTS athlete_credit_movements_membership_idx
  ON athlete_credit_movements (membership_id)
  WHERE membership_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS athlete_credit_movements_expires_at_idx
  ON athlete_credit_movements (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION reject_athlete_credit_movement_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'athlete_credit_movements is immutable';
END;
$$;

DROP TRIGGER IF EXISTS athlete_credit_movements_immutable ON athlete_credit_movements;
CREATE TRIGGER athlete_credit_movements_immutable
  BEFORE UPDATE OR DELETE ON athlete_credit_movements
  FOR EACH ROW EXECUTE FUNCTION reject_athlete_credit_movement_mutation();

CREATE TABLE IF NOT EXISTS athlete_credit_purchases (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  product_code TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  amount_chf NUMERIC(10, 2) NOT NULL CHECK (amount_chf >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  purchased_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  payment_reference TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (btrim(workspace_id) <> ''),
  CHECK (btrim(athlete_id) <> ''),
  CHECK (btrim(product_code) <> ''),
  CHECK (payment_reference IS NULL OR btrim(payment_reference) <> ''),
  CHECK (expires_at = purchased_at + INTERVAL '12 months')
);

CREATE INDEX IF NOT EXISTS athlete_credit_purchases_workspace_athlete_idx
  ON athlete_credit_purchases (workspace_id, athlete_id, purchased_at DESC);

CREATE INDEX IF NOT EXISTS athlete_credit_purchases_status_idx
  ON athlete_credit_purchases (status, purchased_at DESC);

INSERT INTO membership_plans (
  code,
  name,
  active,
  duration_months,
  metadata,
  annual_price_chf,
  monthly_installment_chf,
  production_credits,
  custom_content_credits,
  video_allowed
) VALUES
  ('essential', 'Essentiel', TRUE, 12, '{}'::JSONB, 249.00, 21.00, 1, 2, FALSE),
  ('impact', 'Impact', TRUE, 12, '{}'::JSONB, 549.00, 46.00, 2, 6, TRUE),
  ('signature', 'Signature', TRUE, 12, '{}'::JSONB, 999.00, 84.00, 3, 12, TRUE)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  active = EXCLUDED.active,
  duration_months = EXCLUDED.duration_months,
  metadata = EXCLUDED.metadata,
  annual_price_chf = EXCLUDED.annual_price_chf,
  monthly_installment_chf = EXCLUDED.monthly_installment_chf,
  production_credits = EXCLUDED.production_credits,
  custom_content_credits = EXCLUDED.custom_content_credits,
  video_allowed = EXCLUDED.video_allowed;

COMMENT ON TABLE athlete_credit_movements IS
  'Registre immuable. Le solde est la somme des mouvements non expirés et n’est jamais stocké.';
COMMENT ON COLUMN athlete_credit_movements.expires_at IS
  'Les crédits inclus expirent à la fin du cycle annuel sans report. Les achats expirent 12 mois après achat.';
COMMENT ON COLUMN membership_plans.production_credits IS
  'Photo standard: 1 crédit. Interview éditoriale: 1 crédit. Capsule vidéo simple: 2 crédits; interdite avec Essentiel.';