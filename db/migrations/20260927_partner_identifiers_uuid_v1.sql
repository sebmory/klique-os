BEGIN;

LOCK TABLE user_access, partner_invitations IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMPORARY TABLE partner_identifier_uuid_mapping (
  legacy_id TEXT PRIMARY KEY,
  uuid_id TEXT NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO partner_identifier_uuid_mapping (legacy_id, uuid_id) VALUES
  ('row-5', 'c54c63e1-9ad3-475b-a526-568c6f1fcbbc'),
  ('row-7', '512c0349-236a-4f07-b099-4e6c29e22241');

DO $$
DECLARE
  unexpected_rows TEXT;
  ambiguous_rows TEXT;
BEGIN
  SELECT string_agg(issue, '; ' ORDER BY issue)
  INTO unexpected_rows
  FROM (
    SELECT format(
      'user_access clerk_user_id=%L role=%L partner_id=%L',
      access.clerk_user_id,
      access.role,
      access.partner_id
    ) AS issue
    FROM user_access AS access
    WHERE (access.role = 'partner_expert' OR access.partner_id IS NOT NULL)
      AND (
        access.role <> 'partner_expert'
        OR access.partner_id IS NULL
        OR (
          NOT EXISTS (
            SELECT 1
            FROM partner_identifier_uuid_mapping AS mapping
            WHERE mapping.legacy_id = access.partner_id
          )
          AND access.partner_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )

    UNION ALL

    SELECT format(
      'partner_invitations partner_id=%L workspace_id=%L email=%L',
      invitation.partner_id,
      invitation.workspace_id,
      invitation.email
    ) AS issue
    FROM partner_invitations AS invitation
    WHERE NOT EXISTS (
        SELECT 1
        FROM partner_identifier_uuid_mapping AS mapping
        WHERE mapping.legacy_id = invitation.partner_id
      )
      AND invitation.partner_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) AS unexpected;

  IF unexpected_rows IS NOT NULL THEN
    RAISE EXCEPTION 'Migration des identifiants Partenaire interrompue : lignes inattendues : %', unexpected_rows;
  END IF;

  WITH canonical_user_access AS (
    SELECT
      access.workspace_id,
      COALESCE(mapping.uuid_id, lower(access.partner_id)) AS canonical_partner_id,
      array_agg(access.clerk_user_id ORDER BY access.clerk_user_id) AS clerk_user_ids,
      count(*) AS row_count
    FROM user_access AS access
    LEFT JOIN partner_identifier_uuid_mapping AS mapping
      ON mapping.legacy_id = access.partner_id
    WHERE access.role = 'partner_expert'
    GROUP BY
      access.workspace_id,
      COALESCE(mapping.uuid_id, lower(access.partner_id))
    HAVING count(*) > 1
  ),
  canonical_invitations AS (
    SELECT
      COALESCE(mapping.uuid_id, lower(invitation.partner_id)) AS canonical_partner_id,
      array_agg(invitation.partner_id ORDER BY invitation.partner_id) AS partner_ids,
      count(*) AS row_count
    FROM partner_invitations AS invitation
    LEFT JOIN partner_identifier_uuid_mapping AS mapping
      ON mapping.legacy_id = invitation.partner_id
    GROUP BY COALESCE(mapping.uuid_id, lower(invitation.partner_id))
    HAVING count(*) > 1
  )
  SELECT string_agg(issue, '; ' ORDER BY issue)
  INTO ambiguous_rows
  FROM (
    SELECT format(
      'user_access workspace_id=%L UUID=%L clerk_user_ids=%L',
      access.workspace_id,
      access.canonical_partner_id,
      access.clerk_user_ids
    ) AS issue
    FROM canonical_user_access AS access

    UNION ALL

    SELECT format(
      'partner_invitations UUID=%L partner_ids=%L',
      invitation.canonical_partner_id,
      invitation.partner_ids
    ) AS issue
    FROM canonical_invitations AS invitation
  ) AS ambiguous;

  IF ambiguous_rows IS NOT NULL THEN
    RAISE EXCEPTION 'Migration des identifiants Partenaire interrompue : lignes ambiguës : %', ambiguous_rows;
  END IF;
END;
$$;

UPDATE user_access AS access
SET partner_id = mapping.uuid_id
FROM partner_identifier_uuid_mapping AS mapping
WHERE access.partner_id = mapping.legacy_id;

UPDATE partner_invitations AS invitation
SET partner_id = mapping.uuid_id
FROM partner_identifier_uuid_mapping AS mapping
WHERE invitation.partner_id = mapping.legacy_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM user_access AS access
    JOIN partner_identifier_uuid_mapping AS mapping
      ON mapping.legacy_id = access.partner_id
  ) OR EXISTS (
    SELECT 1
    FROM partner_invitations AS invitation
    JOIN partner_identifier_uuid_mapping AS mapping
      ON mapping.legacy_id = invitation.partner_id
  ) THEN
    RAISE EXCEPTION 'Migration des identifiants Partenaire interrompue : des identifiants legacy subsistent';
  END IF;
END;
$$;

COMMIT;