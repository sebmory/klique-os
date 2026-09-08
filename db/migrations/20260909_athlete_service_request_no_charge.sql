ALTER TABLE athlete_service_requests
  ADD COLUMN IF NOT EXISTS no_charge_reason TEXT NULL;

ALTER TABLE athlete_service_requests
  DROP CONSTRAINT IF EXISTS athlete_service_requests_no_charge_reason_check;

ALTER TABLE athlete_service_requests
  ADD CONSTRAINT athlete_service_requests_no_charge_reason_check CHECK (
    (fulfillment_mode = 'no_charge') = (NULLIF(btrim(no_charge_reason), '') IS NOT NULL)
  );

COMMENT ON COLUMN athlete_service_requests.no_charge_reason IS
  'Motif obligatoire de la prise en charge par KLIQUE sans facturation ni consommation de droit. Renseigné uniquement par un Admin via une reclassification received/to_confirm sans achat, jamais proposé au membre.';
