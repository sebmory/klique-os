ALTER TABLE athlete_subscriptions
  ADD COLUMN IF NOT EXISTS membership_id TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'athlete_subscriptions_membership_id_fkey'
      AND conrelid = 'athlete_subscriptions'::regclass
  ) THEN
    ALTER TABLE athlete_subscriptions
      ADD CONSTRAINT athlete_subscriptions_membership_id_fkey
      FOREIGN KEY (membership_id) REFERENCES athlete_memberships (id) ON DELETE RESTRICT;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM athlete_credit_movements
    WHERE workspace_id = 'klique-os'
      AND athlete_id = 'abdou-bobodi-camara'
  ) THEN
    RAISE EXCEPTION 'Abdou Bobodi Camara possède des mouvements de crédit ; rapprochement interrompu';
  END IF;
END;
$$;

UPDATE athlete_memberships
SET membership_kind = 'founder',
    plan_code = NULL,
    ends_at = DATE '2027-08-18'::TIMESTAMP AT TIME ZONE 'Europe/Zurich',
    auto_renew = FALSE,
    payment_installments = NULL,
    updated_at = NOW()
WHERE workspace_id = 'klique-os'
  AND athlete_id = 'abdou-bobodi-camara'
  AND (
    membership_kind IS DISTINCT FROM 'founder'
    OR plan_code IS NOT NULL
    OR ends_at IS DISTINCT FROM DATE '2027-08-18'::TIMESTAMP AT TIME ZONE 'Europe/Zurich'
    OR auto_renew IS DISTINCT FROM FALSE
    OR payment_installments IS NOT NULL
  );

INSERT INTO athlete_memberships (
  id,
  workspace_id,
  athlete_id,
  membership_kind,
  plan_code,
  status,
  starts_at,
  ends_at,
  auto_renew,
  payment_installments,
  source,
  created_at,
  updated_at
)
SELECT
  'subscription-reconciliation-' || subscription.id::TEXT,
  subscription.workspace_id,
  subscription.athlete_id,
  'founder',
  NULL,
  subscription.status,
  subscription.starts_on::TIMESTAMP AT TIME ZONE 'Europe/Zurich',
  subscription.ends_on::TIMESTAMP AT TIME ZONE 'Europe/Zurich',
  FALSE,
  NULL,
  'subscription_reconciliation',
  NOW(),
  NOW()
FROM athlete_subscriptions AS subscription
WHERE subscription.workspace_id = 'klique-os'
  AND subscription.athlete_id IN (
    'giuliano-muret',
    'stanley-chatain',
    'youssef-abdallaoui'
  )
  AND subscription.plan_code = 'founder'
  AND NOT EXISTS (
    SELECT 1
    FROM athlete_memberships AS existing
    WHERE existing.workspace_id = subscription.workspace_id
      AND existing.athlete_id = subscription.athlete_id
  )
ON CONFLICT DO NOTHING;

WITH membership_candidates AS (
  SELECT
    subscription.id AS subscription_id,
    membership.id AS membership_id,
    ROW_NUMBER() OVER (
      PARTITION BY subscription.id
      ORDER BY
        CASE
          WHEN membership.starts_at::DATE <= subscription.ends_on
            AND (membership.ends_at IS NULL OR membership.ends_at::DATE >= subscription.starts_on)
          THEN 0
          ELSE 1
        END,
        CASE WHEN membership.status = subscription.status THEN 0 ELSE 1 END,
        ABS(EXTRACT(EPOCH FROM (
          membership.starts_at
          - subscription.starts_on::TIMESTAMP AT TIME ZONE 'Europe/Zurich'
        ))),
        membership.created_at DESC,
        membership.id
    ) AS candidate_rank
  FROM athlete_subscriptions AS subscription
  JOIN athlete_memberships AS membership
    ON membership.workspace_id = subscription.workspace_id
   AND membership.athlete_id = subscription.athlete_id
)
UPDATE athlete_subscriptions AS subscription
SET membership_id = candidate.membership_id,
    updated_at = NOW()
FROM membership_candidates AS candidate
WHERE candidate.subscription_id = subscription.id
  AND candidate.candidate_rank = 1
  AND subscription.membership_id IS DISTINCT FROM candidate.membership_id;