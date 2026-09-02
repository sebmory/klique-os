ALTER TABLE athlete_service_requests
  DROP CONSTRAINT IF EXISTS athlete_service_requests_fulfillment_mode_check;

ALTER TABLE athlete_service_requests
  ADD CONSTRAINT athlete_service_requests_fulfillment_mode_check CHECK (
    fulfillment_mode IN ('included_right', 'paid_extra', 'no_charge', 'paid_with_right')
  );

ALTER TABLE athlete_service_requests
  DROP CONSTRAINT IF EXISTS athlete_service_requests_mode_snapshot_check;

ALTER TABLE athlete_service_requests
  ADD CONSTRAINT athlete_service_requests_mode_snapshot_check CHECK (
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
    OR (
      fulfillment_mode = 'paid_with_right'
      AND snapshot_credit_type IS NOT NULL
      AND snapshot_credit_quantity IS NOT NULL
      AND snapshot_price_chf > 0
    )
  );

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
      AND (fulfillment_mode <> 'paid_with_right' OR purchase_id IS NULL)
    )
  );