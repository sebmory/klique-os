BEGIN;

ALTER TABLE creative_profiles
  ADD COLUMN IF NOT EXISTS provenance TEXT;

UPDATE creative_profiles
SET provenance = 'form_application'
WHERE provenance IS NULL;

ALTER TABLE creative_profiles
  ALTER COLUMN provenance SET DEFAULT 'form_application',
  ALTER COLUMN provenance SET NOT NULL,
  ALTER COLUMN application_id DROP NOT NULL,
  ALTER COLUMN source_row DROP NOT NULL;

ALTER TABLE creative_profiles
  DROP CONSTRAINT IF EXISTS creative_profiles_source_row_check,
  DROP CONSTRAINT IF EXISTS creative_profiles_provenance_check,
  DROP CONSTRAINT IF EXISTS creative_profiles_provenance_fields_check;

ALTER TABLE creative_profiles
  ADD CONSTRAINT creative_profiles_provenance_check
    CHECK (provenance IN ('form_application', 'admin_manual')),
  ADD CONSTRAINT creative_profiles_provenance_fields_check
    CHECK (
      (
        provenance = 'form_application'
        AND application_id IS NOT NULL
        AND source_row IS NOT NULL
        AND source_row > 1
      )
      OR (
        provenance = 'admin_manual'
        AND application_id IS NULL
        AND source_row IS NULL
      )
    );

COMMIT;
