BEGIN;

CREATE TABLE IF NOT EXISTS creative_profiles (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provenance TEXT NOT NULL DEFAULT 'form_application',
  application_id UUID NULL,
  display_name TEXT NOT NULL,
  creative_type TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  phone TEXT NULL,
  website_url TEXT NULL,
  portfolio_url TEXT NULL,
  instagram TEXT NULL,
  city TEXT NULL,
  country TEXT NULL,
  coverage_areas TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  specialties TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  bio TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  source_row INTEGER NULL,
  approved_by_clerk_user_id TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creative_profiles_workspace_id_not_blank
    CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT creative_profiles_display_name_not_blank
    CHECK (NULLIF(btrim(display_name), '') IS NOT NULL),
  CONSTRAINT creative_profiles_provenance_check
    CHECK (provenance IN ('form_application', 'admin_manual')),
  CONSTRAINT creative_profiles_creative_type_check
    CHECK (creative_type IN ('photographer', 'videographer', 'both')),
  CONSTRAINT creative_profiles_contact_email_not_blank
    CHECK (NULLIF(btrim(contact_email), '') IS NOT NULL),
  CONSTRAINT creative_profiles_contact_email_check
    CHECK (contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT creative_profiles_website_url_check
    CHECK (website_url IS NULL OR website_url ~* '^https?://[^[:space:]]+$'),
  CONSTRAINT creative_profiles_portfolio_url_check
    CHECK (portfolio_url IS NULL OR portfolio_url ~* '^https?://[^[:space:]]+$'),
  CONSTRAINT creative_profiles_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT creative_profiles_provenance_fields_check
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
    ),
  CONSTRAINT creative_profiles_approved_by_not_blank
    CHECK (NULLIF(btrim(approved_by_clerk_user_id), '') IS NOT NULL),
  CONSTRAINT creative_profiles_dates_check
    CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS creative_profiles_workspace_id_idx
  ON creative_profiles (workspace_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS creative_profiles_workspace_application_idx
  ON creative_profiles (workspace_id, application_id);

CREATE INDEX IF NOT EXISTS creative_profiles_workspace_status_idx
  ON creative_profiles (workspace_id, status, updated_at DESC);

COMMIT;
