WITH eligible_memberships AS (
  SELECT membership.id, membership.workspace_id, membership.athlete_id,
         membership.starts_at, membership.ends_at
  FROM athlete_memberships membership
  WHERE membership.membership_kind = 'founder'
    AND membership.source = 'legacy_founder_migration'
    AND membership.ends_at IS NOT NULL
    AND membership.ends_at = membership.starts_at + INTERVAL '12 months'
),
missing_grants AS (
  SELECT membership.id AS membership_id, membership.workspace_id, membership.athlete_id,
         membership.starts_at, membership.ends_at, grant_row.credit_type
  FROM eligible_memberships membership
  CROSS JOIN (VALUES
    ('production'::TEXT),
    ('custom_content'::TEXT)
  ) AS grant_row(credit_type)
  WHERE NOT EXISTS (
    SELECT 1
    FROM athlete_credit_movements existing
    WHERE existing.workspace_id = membership.workspace_id
      AND existing.athlete_id = membership.athlete_id
      AND existing.membership_id = membership.id
      AND existing.credit_type = grant_row.credit_type
      AND existing.source = 'plan_grant'
  )
)
INSERT INTO athlete_credit_movements (
  id,
  workspace_id,
  athlete_id,
  membership_id,
  credit_type,
  quantity,
  source,
  reference_id,
  expires_at,
  created_at
)
SELECT (
         substr(identifier.hash, 1, 8)
         || '-' || substr(identifier.hash, 9, 4)
         || '-' || substr(identifier.hash, 13, 4)
         || '-' || substr(identifier.hash, 17, 4)
         || '-' || substr(identifier.hash, 21, 12)
       )::UUID,
       missing_grant.workspace_id,
       missing_grant.athlete_id,
       missing_grant.membership_id,
       missing_grant.credit_type,
       1,
       'plan_grant',
       'legacy_founder_grant:' || missing_grant.membership_id,
       missing_grant.ends_at,
       NOW()
FROM missing_grants missing_grant
CROSS JOIN LATERAL (
  SELECT md5(
    'legacy_founder_plan_grant:'
    || missing_grant.workspace_id || ':'
    || missing_grant.athlete_id || ':'
    || missing_grant.membership_id || ':'
    || missing_grant.credit_type
  ) AS hash
) identifier
ON CONFLICT (workspace_id, athlete_id, membership_id, credit_type, reference_id)
  WHERE source = 'plan_grant'
    AND membership_id IS NOT NULL
    AND reference_id IS NOT NULL
  DO NOTHING;
