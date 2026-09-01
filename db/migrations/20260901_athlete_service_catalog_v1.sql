CREATE TABLE IF NOT EXISTS athlete_service_products (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  price_chf NUMERIC(10, 2) NOT NULL CHECK (price_chf >= 0),
  fulfillment_kind TEXT NOT NULL CHECK (fulfillment_kind IN (
    'photo_session',
    'match_coverage',
    'match_credit_upgrade',
    'editorial_interview',
    'custom_content',
    'simple_video'
  )),
  included_deliverables INTEGER NOT NULL DEFAULT 1 CHECK (included_deliverables > 0),
  commercial_scope TEXT NOT NULL,
  allowed_plan_codes TEXT[] NULL,
  required_production_credits INTEGER NOT NULL DEFAULT 0 CHECK (required_production_credits >= 0),
  validity_months INTEGER NOT NULL DEFAULT 12 CHECK (validity_months = 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (btrim(code) <> ''),
  CHECK (btrim(name) <> ''),
  CHECK (btrim(commercial_scope) <> ''),
  CHECK (allowed_plan_codes IS NULL OR cardinality(allowed_plan_codes) > 0),
  CHECK (
    (code = 'match_coverage_upgrade' AND fulfillment_kind = 'match_credit_upgrade' AND required_production_credits = 1)
    OR (code <> 'match_coverage_upgrade' AND required_production_credits = 0)
  )
);

CREATE TABLE IF NOT EXISTS athlete_credit_purchase_executions (
  id UUID PRIMARY KEY,
  purchase_id UUID NOT NULL REFERENCES athlete_credit_purchases (id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  executed_at TIMESTAMPTZ NOT NULL,
  reference_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reference_id IS NULL OR btrim(reference_id) <> '')
);

CREATE INDEX IF NOT EXISTS athlete_credit_purchase_executions_purchase_idx
  ON athlete_credit_purchase_executions (purchase_id, executed_at DESC);

CREATE OR REPLACE FUNCTION reject_athlete_credit_purchase_execution_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'athlete_credit_purchase_executions is immutable';
END;
$$;

DROP TRIGGER IF EXISTS athlete_credit_purchase_executions_immutable ON athlete_credit_purchase_executions;
CREATE TRIGGER athlete_credit_purchase_executions_immutable
  BEFORE UPDATE OR DELETE ON athlete_credit_purchase_executions
  FOR EACH ROW EXECUTE FUNCTION reject_athlete_credit_purchase_execution_mutation();

INSERT INTO athlete_service_products (
  code,
  name,
  active,
  price_chf,
  fulfillment_kind,
  included_deliverables,
  commercial_scope,
  allowed_plan_codes,
  required_production_credits,
  validity_months
) VALUES
  ('photo_session_standard', 'Session photo KLIQUE', TRUE, 149.00, 'photo_session', 1,
   'Hors match ou compétition, environ 60 minutes, un athlète, un lieu, jusqu’à 20 photos finalisées.', NULL, 0, 12),
  ('match_coverage_individual', 'Couverture individuelle d’un match', TRUE, 179.00, 'match_coverage', 1,
   'Un match ou une compétition, suivi prioritaire de l’athlète, jusqu’à 20 photos selon temps de jeu, conditions, disponibilités et autorisations.', NULL, 0, 12),
  ('match_coverage_upgrade', 'Conversion d’un crédit production en couverture de match', TRUE, 30.00, 'match_credit_upgrade', 1,
   'Un match ou une compétition, suivi prioritaire de l’athlète, jusqu’à 20 photos selon temps de jeu, conditions, disponibilités et autorisations.', NULL, 1, 12),
  ('editorial_interview', 'Interview éditoriale', TRUE, 89.00, 'editorial_interview', 1,
   'Préparation, entretien, rédaction et publication, sans séance photo.', NULL, 0, 12),
  ('custom_content_single', 'Contenu personnalisé', TRUE, 39.00, 'custom_content', 1,
   'Un livrable final depuis du matériel existant.', NULL, 0, 12),
  ('custom_content_pack_5', 'Pack de 5 contenus', TRUE, 169.00, 'custom_content', 5,
   'Cinq livrables finaux depuis du matériel existant.', NULL, 0, 12),
  ('simple_video_capsule', 'Capsule vidéo simple', TRUE, 349.00, 'simple_video', 1,
   'Format simple ; projets complexes sur devis.', ARRAY['impact', 'signature']::TEXT[], 0, 12)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  active = EXCLUDED.active,
  price_chf = EXCLUDED.price_chf,
  fulfillment_kind = EXCLUDED.fulfillment_kind,
  included_deliverables = EXCLUDED.included_deliverables,
  commercial_scope = EXCLUDED.commercial_scope,
  allowed_plan_codes = EXCLUDED.allowed_plan_codes,
  required_production_credits = EXCLUDED.required_production_credits,
  validity_months = EXCLUDED.validity_months,
  updated_at = NOW();

ALTER TABLE athlete_credit_purchases
  ADD CONSTRAINT athlete_credit_purchases_product_code_fkey
  FOREIGN KEY (product_code) REFERENCES athlete_service_products (code) ON DELETE RESTRICT;

COMMENT ON TABLE athlete_service_products IS
  'Catalogue des prestations Athlètes à la carte. Chaque produit conserve son périmètre et ne devient pas un crédit générique.';

COMMENT ON TABLE athlete_credit_purchase_executions IS
  'Registre immuable des livrables exécutés. Le restant est calculé depuis la quantité achetée et les exécutions.';