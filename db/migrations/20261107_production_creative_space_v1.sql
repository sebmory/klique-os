BEGIN;

ALTER TABLE creative_profiles
  ADD COLUMN IF NOT EXISTS general_availability TEXT NULL;

CREATE TABLE IF NOT EXISTS production_creative_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  production_source TEXT NOT NULL DEFAULT 'google_sheets',
  production_source_row INTEGER NULL,
  production_source_fingerprint TEXT NOT NULL,
  production_snapshot JSONB NOT NULL,
  origin_type TEXT NOT NULL DEFAULT 'admin_production'
    CHECK (origin_type IN ('admin_production', 'athlete_session_request')),
  origin_request_id UUID NULL,
  planning_timezone TEXT NOT NULL DEFAULT 'Europe/Zurich'
    CHECK (planning_timezone = 'Europe/Zurich'),
  title TEXT NOT NULL,
  creative_type TEXT NOT NULL CHECK (creative_type IN ('photo', 'video', 'photo_video')),
  athlete_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_date DATE NULL,
  date_to_agree BOOLEAN NOT NULL DEFAULT FALSE,
  region TEXT NOT NULL,
  location_details TEXT NULL,
  objective TEXT NOT NULL,
  deliverables TEXT NOT NULL,
  delivery_due_date DATE NULL,
  compensation_type TEXT NOT NULL CHECK (compensation_type IN ('unpaid_collaboration', 'paid_mandate')),
  compensation_amount_minor INTEGER NULL,
  compensation_currency TEXT NULL,
  expenses_covered BOOLEAN NOT NULL,
  expense_terms TEXT NOT NULL,
  credits_and_usage TEXT NOT NULL,
  necessary_contact_details TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'assigned', 'cancelled')),
  conditions_version INTEGER NOT NULL DEFAULT 1,
  assigned_creative_profile_id UUID NULL,
  assigned_at TIMESTAMPTZ NULL,
  created_by_clerk_user_id TEXT NOT NULL,
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT production_creative_briefs_workspace_not_blank CHECK (NULLIF(btrim(workspace_id), '') IS NOT NULL),
  CONSTRAINT production_creative_briefs_fingerprint_not_blank CHECK (NULLIF(btrim(production_source_fingerprint), '') IS NOT NULL),
  CONSTRAINT production_creative_briefs_snapshot_object CHECK (jsonb_typeof(production_snapshot) = 'object'),
  CONSTRAINT production_creative_briefs_athletes_array CHECK (jsonb_typeof(athlete_refs) = 'array'),
  CONSTRAINT production_creative_briefs_required_text CHECK (
    NULLIF(btrim(title), '') IS NOT NULL
    AND NULLIF(btrim(region), '') IS NOT NULL
    AND NULLIF(btrim(objective), '') IS NOT NULL
    AND NULLIF(btrim(deliverables), '') IS NOT NULL
    AND NULLIF(btrim(expense_terms), '') IS NOT NULL
    AND NULLIF(btrim(credits_and_usage), '') IS NOT NULL
  ),
  CONSTRAINT production_creative_briefs_date_check CHECK (date_to_agree OR scheduled_date IS NOT NULL),
  CONSTRAINT production_creative_briefs_finance_check CHECK (
    (compensation_type = 'unpaid_collaboration' AND compensation_amount_minor IS NULL AND compensation_currency IS NULL)
    OR
    (compensation_type = 'paid_mandate' AND compensation_amount_minor IS NOT NULL
      AND compensation_amount_minor >= 0 AND compensation_currency ~ '^[A-Z]{3}$')
  ),
  CONSTRAINT production_creative_briefs_assignment_check CHECK (
    (status <> 'assigned' AND assigned_creative_profile_id IS NULL AND assigned_at IS NULL)
    OR
    (status = 'assigned' AND assigned_creative_profile_id IS NOT NULL AND assigned_at IS NOT NULL)
  ),
  CONSTRAINT production_creative_briefs_assignee_fk
    FOREIGN KEY (workspace_id, assigned_creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS production_creative_briefs_workspace_id_idx
  ON production_creative_briefs (workspace_id, id);
CREATE INDEX IF NOT EXISTS production_creative_briefs_source_lookup_idx
  ON production_creative_briefs (workspace_id, production_source, production_source_row);
CREATE INDEX IF NOT EXISTS production_creative_briefs_status_idx
  ON production_creative_briefs (workspace_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS production_creative_briefs_source_anchor_unique_idx
  ON production_creative_briefs (
    workspace_id,
    production_source,
    production_source_row,
    production_source_fingerprint
  );

CREATE TABLE IF NOT EXISTS production_creative_condition_versions (
  workspace_id TEXT NOT NULL,
  brief_id UUID NOT NULL,
  version INTEGER NOT NULL,
  conditions_snapshot JSONB NOT NULL,
  created_by_clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, brief_id, version),
  CHECK (version > 0),
  CHECK (jsonb_typeof(conditions_snapshot) = 'object'),
  FOREIGN KEY (workspace_id, brief_id)
    REFERENCES production_creative_briefs (workspace_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS production_creative_recipients (
  workspace_id TEXT NOT NULL,
  brief_id UUID NOT NULL,
  creative_profile_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, brief_id, creative_profile_id),
  FOREIGN KEY (workspace_id, brief_id)
    REFERENCES production_creative_briefs (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS production_creative_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  brief_id UUID NOT NULL,
  creative_profile_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('interested', 'withdrawn', 'selected', 'not_selected')),
  message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, brief_id, creative_profile_id),
  CHECK (char_length(COALESCE(message, '')) <= 500),
  FOREIGN KEY (workspace_id, brief_id)
    REFERENCES production_creative_briefs (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS production_creative_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  brief_id UUID NOT NULL,
  creative_profile_id UUID NOT NULL,
  conditions_version INTEGER NOT NULL,
  conditions_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'refused', 'superseded')),
  confirmation_status TEXT NOT NULL DEFAULT 'pending' CHECK (confirmation_status IN ('pending', 'confirmed', 'confirmation_required')),
  refusal_reason TEXT NULL,
  refused_at TIMESTAMPTZ NULL,
  confirmed_at TIMESTAMPTZ NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'delivered', 'changes_requested', 'validated')),
  delivery_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_comment TEXT NULL,
  review_comment TEXT NULL,
  delivered_at TIMESTAMPTZ NULL,
  validated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(conditions_snapshot) = 'object'),
  CHECK (jsonb_typeof(delivery_links) = 'array'),
  CHECK (char_length(COALESCE(delivery_comment, '')) <= 2000),
  CHECK (char_length(COALESCE(review_comment, '')) <= 2000),
  CHECK (char_length(COALESCE(refusal_reason, '')) <= 1000),
  CHECK (
    (status <> 'refused' AND refusal_reason IS NULL AND refused_at IS NULL)
    OR
    (status = 'refused' AND NULLIF(btrim(refusal_reason), '') IS NOT NULL AND refused_at IS NOT NULL)
  ),
  CHECK (delivery_status <> 'changes_requested' OR NULLIF(btrim(review_comment), '') IS NOT NULL),
  FOREIGN KEY (workspace_id, brief_id)
    REFERENCES production_creative_briefs (workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, brief_id, conditions_version)
    REFERENCES production_creative_condition_versions (workspace_id, brief_id, version)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, creative_profile_id)
    REFERENCES creative_profiles (workspace_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS production_creative_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  brief_id UUID NOT NULL,
  creative_profile_id UUID NULL,
  action TEXT NOT NULL,
  actor_clerk_user_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(details) = 'object'),
  FOREIGN KEY (workspace_id, brief_id)
    REFERENCES production_creative_briefs (workspace_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS production_creative_assignments_workspace_id_idx
  ON production_creative_assignments (workspace_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS production_creative_assignments_active_brief_unique_idx
  ON production_creative_assignments (workspace_id, brief_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS production_creative_events_history_idx
  ON production_creative_events (workspace_id, brief_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_production_creative_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'production_creative_events is immutable';
END;
$$;

DROP TRIGGER IF EXISTS production_creative_events_immutable ON production_creative_events;
CREATE TRIGGER production_creative_events_immutable
  BEFORE UPDATE OR DELETE ON production_creative_events
  FOR EACH ROW EXECUTE FUNCTION prevent_production_creative_event_mutation();

COMMENT ON COLUMN production_creative_briefs.production_source_row IS
  'Indice de rapprochement uniquement. Ne constitue ni une identité stable ni une preuve d autorisation.';
COMMENT ON COLUMN production_creative_briefs.production_source_fingerprint IS
  'Empreinte de vérification de l instantané source. Les relations persistantes utilisent brief.id.';
COMMENT ON COLUMN production_creative_briefs.origin_request_id IS
  'Point d extension vers une future demande athlète validée; une demande ne constitue jamais une attribution.';
COMMENT ON TABLE production_creative_events IS
  'Journal append-only des publications, candidatures, attributions, confirmations et livraisons.';
COMMENT ON TABLE production_creative_condition_versions IS
  'Versions immuables des conditions substantielles: rémunération, frais, livrables, droits, date, lieu et échéance.';
COMMENT ON COLUMN production_creative_assignments.status IS
  'Une attribution refusée ou remplacée reste conservée avec ses confirmations et livraisons historiques.';

COMMIT;
