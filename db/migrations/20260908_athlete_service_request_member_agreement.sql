ALTER TABLE athlete_service_requests
  DROP CONSTRAINT IF EXISTS athlete_service_requests_final_link_check;

ALTER TABLE athlete_service_requests
  ADD CONSTRAINT athlete_service_requests_final_link_check CHECK (
    (
      status = 'completed'
      AND (
        (fulfillment_mode = 'included_right' AND usage_movement_id IS NOT NULL AND purchase_id IS NULL)
        OR (fulfillment_mode = 'paid_extra' AND purchase_id IS NOT NULL AND usage_movement_id IS NULL)
        OR (fulfillment_mode = 'no_charge' AND purchase_id IS NULL AND usage_movement_id IS NULL)
        OR (fulfillment_mode = 'paid_with_right' AND purchase_id IS NOT NULL AND usage_movement_id IS NOT NULL)
      )
    )
    OR (
      status <> 'completed'
      AND usage_movement_id IS NULL
    )
  );

COMMENT ON CONSTRAINT athlete_service_requests_final_link_check ON athlete_service_requests IS
  'Autorise un achat pending lié après accord membre avant planification; les liens finaux restent requis à completed.';
