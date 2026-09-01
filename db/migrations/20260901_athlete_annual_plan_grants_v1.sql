CREATE UNIQUE INDEX IF NOT EXISTS athlete_credit_movements_plan_cycle_unique_idx
  ON athlete_credit_movements (
    workspace_id,
    athlete_id,
    membership_id,
    credit_type,
    reference_id
  )
  WHERE source = 'plan_grant'
    AND membership_id IS NOT NULL
    AND reference_id IS NOT NULL;