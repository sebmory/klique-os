BEGIN;

DO $$
DECLARE
  has_terms_version BOOLEAN;
  has_terms_accepted_at BOOLEAN;
  existing_row_count BIGINT;
  has_incomplete_consent BOOLEAN := FALSE;
BEGIN
  IF to_regclass('public.athlete_membership_prospect_orders') IS NULL THEN
    RAISE EXCEPTION 'athlete_membership_prospect_orders does not exist';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'athlete_membership_prospect_orders'
      AND column_name = 'terms_version'
  ) INTO has_terms_version;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'athlete_membership_prospect_orders'
      AND column_name = 'terms_accepted_at'
  ) INTO has_terms_accepted_at;

  SELECT count(*)
  INTO existing_row_count
  FROM athlete_membership_prospect_orders;

  IF existing_row_count > 0 AND (NOT has_terms_version OR NOT has_terms_accepted_at) THEN
    RAISE EXCEPTION
      'Cannot add required consent columns: % existing prospect order(s) require an explicit consent backfill',
      existing_row_count;
  END IF;

  IF existing_row_count > 0 THEN
    EXECUTE '
      SELECT EXISTS (
        SELECT 1
        FROM athlete_membership_prospect_orders
        WHERE terms_version IS NULL
          OR btrim(terms_version) = ''''
          OR terms_accepted_at IS NULL
      )'
    INTO has_incomplete_consent;

    IF has_incomplete_consent THEN
      RAISE EXCEPTION
        'Cannot enforce required consent columns: existing prospect orders require an explicit consent backfill';
    END IF;
  END IF;
END;
$$;

ALTER TABLE athlete_membership_prospect_orders
  ADD COLUMN IF NOT EXISTS terms_version TEXT,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

ALTER TABLE athlete_membership_prospect_orders
  ALTER COLUMN terms_version SET NOT NULL,
  ALTER COLUMN terms_accepted_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'athlete_membership_prospect_orders_terms_version_check'
      AND conrelid = 'athlete_membership_prospect_orders'::regclass
  ) THEN
    ALTER TABLE athlete_membership_prospect_orders
      ADD CONSTRAINT athlete_membership_prospect_orders_terms_version_check
      CHECK (btrim(terms_version) <> '');
  END IF;
END;
$$;

COMMIT;