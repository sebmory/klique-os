CREATE TABLE IF NOT EXISTS athlete_service_requests (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  product_code TEXT NOT NULL REFERENCES athlete_service_products (code) ON DELETE RESTRICT,
  fulfillment_mode TEXT NOT NULL CHECK (fulfillment_mode IN ('included_right', 'paid_extra', 'no_charge')),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
    'received',
    'to_confirm',
    'scheduled',
    'in_progress',
    'completed',
    'refused'
  )),
  requested_details JSONB NOT NULL DEFAULT '{}'::JSONB,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  refused_at TIMESTAMPTZ NULL,
  refusal_reason TEXT NULL,
  snapshot_credit_type TEXT NULL CHECK (snapshot_credit_type IN ('production', 'custom_content')),
  snapshot_credit_quantity INTEGER NULL CHECK (snapshot_credit_quantity > 0),
  snapshot_price_chf NUMERIC(10, 2) NULL CHECK (snapshot_price_chf >= 0),
  purchase_id UUID NULL REFERENCES athlete_credit_purchases (id) ON DELETE RESTRICT,
  usage_movement_id UUID NULL REFERENCES athlete_credit_movements (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT athlete_service_requests_identity_check CHECK (
    btrim(workspace_id) <> '' AND btrim(athlete_id) <> '' AND btrim(product_code) <> ''
  ),
  CONSTRAINT athlete_service_requests_details_check CHECK (jsonb_typeof(requested_details) = 'object'),
  CONSTRAINT athlete_service_requests_mode_snapshot_check CHECK (
    (
      fulfillment_mode = 'included_right'
      AND snapshot_credit_type IS NOT NULL
      AND snapshot_credit_quantity IS NOT NULL
      AND snapshot_price_chf IS NULL
      AND purchase_id IS NULL
    )
    OR (
      fulfillment_mode = 'paid_extra'
      AND snapshot_credit_type IS NULL
      AND snapshot_credit_quantity IS NULL
      AND snapshot_price_chf IS NOT NULL
      AND usage_movement_id IS NULL
    )
    OR (
      fulfillment_mode = 'no_charge'
      AND snapshot_credit_type IS NULL
      AND snapshot_credit_quantity IS NULL
      AND snapshot_price_chf IS NULL
      AND purchase_id IS NULL
      AND usage_movement_id IS NULL
    )
  ),
  CONSTRAINT athlete_service_requests_final_link_check CHECK (
    (
      status = 'completed'
      AND (
        (fulfillment_mode = 'included_right' AND usage_movement_id IS NOT NULL AND purchase_id IS NULL)
        OR (fulfillment_mode = 'paid_extra' AND purchase_id IS NOT NULL AND usage_movement_id IS NULL)
        OR (fulfillment_mode = 'no_charge' AND purchase_id IS NULL AND usage_movement_id IS NULL)
      )
    )
    OR (
      status <> 'completed'
      AND usage_movement_id IS NULL
    )
  ),
  CONSTRAINT athlete_service_requests_status_dates_check CHECK (
    (status NOT IN ('scheduled', 'in_progress', 'completed') OR scheduled_at IS NOT NULL)
    AND (status NOT IN ('in_progress', 'completed') OR started_at IS NOT NULL)
    AND ((status = 'completed') = (completed_at IS NOT NULL))
    AND ((status = 'refused') = (refused_at IS NOT NULL))
    AND ((status = 'refused') = (NULLIF(btrim(refusal_reason), '') IS NOT NULL))
  ),
  CONSTRAINT athlete_service_requests_date_order_check CHECK (
    requested_at <= created_at
    AND created_at <= updated_at
    AND (scheduled_at IS NULL OR requested_at <= scheduled_at)
    AND (started_at IS NULL OR scheduled_at IS NOT NULL AND scheduled_at <= started_at)
    AND (completed_at IS NULL OR started_at IS NOT NULL AND started_at <= completed_at)
    AND (refused_at IS NULL OR requested_at <= refused_at)
  )
);

CREATE INDEX IF NOT EXISTS athlete_service_requests_workspace_athlete_status_idx
  ON athlete_service_requests (workspace_id, athlete_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS athlete_service_requests_product_status_idx
  ON athlete_service_requests (product_code, status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS athlete_service_requests_purchase_unique_idx
  ON athlete_service_requests (purchase_id)
  WHERE purchase_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS athlete_service_requests_usage_movement_unique_idx
  ON athlete_service_requests (usage_movement_id)
  WHERE usage_movement_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS athlete_credit_movements_service_request_usage_unique_idx
  ON athlete_credit_movements (reference_id)
  WHERE source = 'usage' AND reference_id LIKE 'athlete_service_request:%';

CREATE UNIQUE INDEX IF NOT EXISTS athlete_credit_purchase_executions_request_unique_idx
  ON athlete_credit_purchase_executions (purchase_id, reference_id)
  WHERE reference_id LIKE 'athlete_service_request:%';

COMMENT ON TABLE athlete_service_requests IS
  'Workflow des demandes de services Athlète. La création d une demande ne crée aucun achat, paiement, mouvement de crédit ni exécution.';

COMMENT ON COLUMN athlete_service_requests.snapshot_credit_quantity IS
  'Quantité de droits figée lors de la confirmation. Aucun solde ni réservation agrégée n est stocké sur la demande.';

COMMENT ON COLUMN athlete_service_requests.usage_movement_id IS
  'Renseigné uniquement lors de la transition atomique vers completed pour une demande utilisant un droit inclus.';

COMMENT ON INDEX athlete_credit_movements_service_request_usage_unique_idx IS
  'Le reference_id d un mouvement usage lié à une demande suit athlete_service_request:<uuid> et garantit une consommation idempotente.';

COMMENT ON INDEX athlete_credit_purchase_executions_request_unique_idx IS
  'Pour une exécution payante, reference_id suit athlete_service_request:<uuid> et empêche une double exécution du même achat pour la même demande.';

COMMENT ON TABLE athlete_credit_movements IS
  'Registre immuable. Le solde disponible reste calculé depuis les mouvements non expirés; les droits réservés seront calculés ultérieurement depuis les demandes scheduled et in_progress, sans stocker de solde.';
