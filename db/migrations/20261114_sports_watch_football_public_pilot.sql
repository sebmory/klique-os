BEGIN;

ALTER TABLE sports_watch_candidates
  ADD COLUMN IF NOT EXISTS football_evidence_json JSONB NULL,
  ADD COLUMN IF NOT EXISTS football_completion_json JSONB NULL,
  ADD COLUMN IF NOT EXISTS football_resolution TEXT NULL,
  ADD CONSTRAINT sports_watch_candidates_football_evidence_check CHECK (
    source_key <> 'football-public'
    OR (
      football_evidence_json IS NOT NULL
      AND football_evidence_json->>'mode' = 'football_public'
      AND football_evidence_json->>'matchKey' IS NOT NULL
      AND football_evidence_json->>'eventDate' IS NOT NULL
      AND football_evidence_json->>'publicReference' IS NOT NULL
      AND football_evidence_json->>'team' IS NOT NULL
      AND football_evidence_json->>'opponent' IS NOT NULL
    )
  ),
  ADD CONSTRAINT sports_watch_candidates_football_completion_check CHECK (
    football_completion_json IS NULL
    OR (
      football_completion_json->>'mode' IN (
        'football_pro_completion',
        'public_source_attached'
      )
      AND manual_entry_json IS NOT NULL
      AND football_evidence_json IS NOT NULL
      AND created_by_clerk_user_id IS NOT NULL
      AND btrim(created_by_clerk_user_id) <> ''
    )
  ),
  ADD CONSTRAINT sports_watch_candidates_football_resolution_check CHECK (
    football_resolution IS NULL
    OR football_resolution IN (
      'participation_unverifiable',
      'not_exploitable',
      'incorrect'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS sports_watch_candidates_football_completion_idempotency_unique
  ON sports_watch_candidates (workspace_id, idempotency_key)
  WHERE football_completion_json IS NOT NULL AND idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS sports_watch_football_bindings (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  footstats_team_id TEXT NOT NULL,
  footstats_team_name_snapshot TEXT NOT NULL,
  footstats_player_id TEXT NULL,
  footstats_player_name_snapshot TEXT NULL,
  aff_team_id TEXT NULL,
  aff_player_id TEXT NULL,
  competition_snapshot TEXT NOT NULL,
  season_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  roster_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  verification_evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_by_clerk_user_id TEXT NULL,
  verified_at TIMESTAMPTZ NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sports_watch_football_bindings_workspace_check
    CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_football_bindings_athlete_check
    CHECK (btrim(athlete_id) <> ''),
  CONSTRAINT sports_watch_football_bindings_footstats_check CHECK (
    footstats_team_id ~ '^[A-Za-z0-9]{6,20}$'
    AND btrim(footstats_team_name_snapshot) <> ''
    AND (
      footstats_player_id IS NULL
      OR footstats_player_id ~ '^[A-Za-z0-9]{6,20}$'
    )
    AND (
      (footstats_player_id IS NULL AND footstats_player_name_snapshot IS NULL)
      OR (
        footstats_player_id IS NOT NULL
        AND footstats_player_name_snapshot IS NOT NULL
        AND btrim(footstats_player_name_snapshot) <> ''
      )
    )
  ),
  CONSTRAINT sports_watch_football_bindings_aff_check CHECK (
    (aff_player_id IS NULL OR aff_team_id IS NOT NULL)
    AND (aff_team_id IS NULL OR btrim(aff_team_id) <> '')
    AND (aff_player_id IS NULL OR btrim(aff_player_id) <> '')
  ),
  CONSTRAINT sports_watch_football_bindings_status_check CHECK (
    status IN ('draft', 'verified', 'ambiguous', 'disabled')
  ),
  CONSTRAINT sports_watch_football_bindings_verification_check CHECK (
    (
      status = 'verified'
      AND footstats_player_id IS NOT NULL
      AND verified_by_clerk_user_id IS NOT NULL
      AND btrim(verified_by_clerk_user_id) <> ''
      AND verified_at IS NOT NULL
    )
    OR (
      status <> 'verified'
      AND verified_by_clerk_user_id IS NULL
      AND verified_at IS NULL
    )
  ),
  CONSTRAINT sports_watch_football_bindings_roster_check
    CHECK (jsonb_typeof(roster_snapshot_json) = 'array'),
  CONSTRAINT sports_watch_football_bindings_evidence_check
    CHECK (jsonb_typeof(verification_evidence_json) = 'array'),
  CONSTRAINT sports_watch_football_bindings_version_check CHECK (version >= 1),
  CONSTRAINT sports_watch_football_bindings_athlete_unique
    UNIQUE (workspace_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS sports_watch_football_bindings_workspace_idx
  ON sports_watch_football_bindings (workspace_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS sports_watch_football_bindings_verified_idx
  ON sports_watch_football_bindings (workspace_id, athlete_id)
  WHERE status = 'verified';

CREATE TABLE IF NOT EXISTS sports_watch_candidate_reconciliations (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  manual_candidate_id UUID NOT NULL,
  automatic_candidate_id UUID NOT NULL,
  decision TEXT NOT NULL DEFAULT 'pending',
  comparison_json JSONB NOT NULL,
  decided_by_clerk_user_id TEXT NULL,
  decided_at TIMESTAMPTZ NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sports_watch_candidate_reconciliations_workspace_check
    CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_candidate_reconciliations_distinct_check
    CHECK (manual_candidate_id <> automatic_candidate_id),
  CONSTRAINT sports_watch_candidate_reconciliations_decision_check CHECK (
    decision IN (
      'pending',
      'keep_manual',
      'keep_automatic',
      'complete_manual',
      'different_events',
      'examine_later'
    )
  ),
  CONSTRAINT sports_watch_candidate_reconciliations_actor_check CHECK (
    (
      decision = 'pending'
      AND decided_by_clerk_user_id IS NULL
      AND decided_at IS NULL
    )
    OR (
      decision <> 'pending'
      AND decided_by_clerk_user_id IS NOT NULL
      AND btrim(decided_by_clerk_user_id) <> ''
      AND decided_at IS NOT NULL
    )
  ),
  CONSTRAINT sports_watch_candidate_reconciliations_comparison_check CHECK (
    jsonb_typeof(comparison_json) = 'object'
    AND jsonb_typeof(comparison_json->'identical') = 'array'
    AND jsonb_typeof(comparison_json->'complementary') = 'array'
    AND jsonb_typeof(comparison_json->'contradictions') = 'array'
  ),
  CONSTRAINT sports_watch_candidate_reconciliations_version_check CHECK (version >= 1),
  CONSTRAINT sports_watch_candidate_reconciliations_workspace_id_unique
    UNIQUE (workspace_id, id),
  CONSTRAINT sports_watch_candidate_reconciliations_manual_fk
    FOREIGN KEY (workspace_id, manual_candidate_id)
    REFERENCES sports_watch_candidates (workspace_id, id),
  CONSTRAINT sports_watch_candidate_reconciliations_automatic_fk
    FOREIGN KEY (workspace_id, automatic_candidate_id)
    REFERENCES sports_watch_candidates (workspace_id, id),
  CONSTRAINT sports_watch_candidate_reconciliations_pair_unique
    UNIQUE (workspace_id, manual_candidate_id, automatic_candidate_id)
);

CREATE INDEX IF NOT EXISTS sports_watch_candidate_reconciliations_workspace_idx
  ON sports_watch_candidate_reconciliations (workspace_id, decision, updated_at DESC);

CREATE TABLE IF NOT EXISTS sports_watch_candidate_reconciliation_events (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  reconciliation_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (
    action IN (
      'created',
      'keep_manual',
      'keep_automatic',
      'complete_manual',
      'different_events',
      'examine_later'
    )
  ),
  actor_clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sports_watch_candidate_reconciliation_events_workspace_check
    CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_candidate_reconciliation_events_actor_check
    CHECK (btrim(actor_clerk_user_id) <> ''),
  CONSTRAINT sports_watch_candidate_reconciliation_events_parent_fk
    FOREIGN KEY (workspace_id, reconciliation_id)
    REFERENCES sports_watch_candidate_reconciliations (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS sports_watch_candidate_reconciliation_events_parent_idx
  ON sports_watch_candidate_reconciliation_events (
    workspace_id, reconciliation_id, created_at DESC
  );

CREATE TABLE IF NOT EXISTS sports_watch_football_source_suggestions (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  manual_candidate_id UUID NOT NULL,
  match_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  evidence_json JSONB NOT NULL,
  comparison_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by_clerk_user_id TEXT NULL,
  decided_at TIMESTAMPTZ NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sports_watch_football_source_suggestions_workspace_check
    CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_football_source_suggestions_match_check
    CHECK (btrim(match_key) <> '' AND btrim(content_hash) <> ''),
  CONSTRAINT sports_watch_football_source_suggestions_evidence_check CHECK (
    evidence_json->>'mode' = 'football_public'
  ),
  CONSTRAINT sports_watch_football_source_suggestions_comparison_check CHECK (
    jsonb_typeof(comparison_json) = 'object'
    AND jsonb_typeof(comparison_json->'identical') = 'array'
    AND jsonb_typeof(comparison_json->'complementary') = 'array'
    AND jsonb_typeof(comparison_json->'contradictions') = 'array'
  ),
  CONSTRAINT sports_watch_football_source_suggestions_status_check
    CHECK (status IN ('pending', 'attached', 'rejected')),
  CONSTRAINT sports_watch_football_source_suggestions_actor_check CHECK (
    (
      status = 'pending'
      AND decided_by_clerk_user_id IS NULL
      AND decided_at IS NULL
    )
    OR (
      status <> 'pending'
      AND decided_by_clerk_user_id IS NOT NULL
      AND btrim(decided_by_clerk_user_id) <> ''
      AND decided_at IS NOT NULL
    )
  ),
  CONSTRAINT sports_watch_football_source_suggestions_version_check CHECK (version >= 1),
  CONSTRAINT sports_watch_football_source_suggestions_manual_fk
    FOREIGN KEY (workspace_id, manual_candidate_id)
    REFERENCES sports_watch_candidates (workspace_id, id),
  CONSTRAINT sports_watch_football_source_suggestions_unique
    UNIQUE (workspace_id, manual_candidate_id, match_key, content_hash)
);

CREATE INDEX IF NOT EXISTS sports_watch_football_source_suggestions_workspace_idx
  ON sports_watch_football_source_suggestions (workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS sports_watch_football_completion_events (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  previous_candidate_id UUID NOT NULL,
  new_candidate_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (
    action IN ('footstats_pro_completed', 'public_source_attached')
  ),
  actor_clerk_user_id TEXT NOT NULL,
  previous_version INTEGER NOT NULL,
  new_version INTEGER NOT NULL,
  public_facts_json JSONB NOT NULL,
  manual_facts_json JSONB NOT NULL,
  field_provenance_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sports_watch_football_completion_events_workspace_check
    CHECK (btrim(workspace_id) <> ''),
  CONSTRAINT sports_watch_football_completion_events_actor_check
    CHECK (btrim(actor_clerk_user_id) <> ''),
  CONSTRAINT sports_watch_football_completion_events_version_check
    CHECK (previous_version >= 1 AND new_version = previous_version + 1),
  CONSTRAINT sports_watch_football_completion_events_previous_fk
    FOREIGN KEY (workspace_id, previous_candidate_id)
    REFERENCES sports_watch_candidates (workspace_id, id),
  CONSTRAINT sports_watch_football_completion_events_new_fk
    FOREIGN KEY (workspace_id, new_candidate_id)
    REFERENCES sports_watch_candidates (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS sports_watch_football_completion_events_candidate_idx
  ON sports_watch_football_completion_events (
    workspace_id, previous_candidate_id, new_candidate_id, created_at DESC
  );

CREATE OR REPLACE FUNCTION prevent_sports_watch_reconciliation_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'sports_watch_candidate_reconciliation_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS sports_watch_candidate_reconciliation_events_append_only
  ON sports_watch_candidate_reconciliation_events;

CREATE TRIGGER sports_watch_candidate_reconciliation_events_append_only
BEFORE UPDATE OR DELETE ON sports_watch_candidate_reconciliation_events
FOR EACH ROW
EXECUTE FUNCTION prevent_sports_watch_reconciliation_event_mutation();

CREATE OR REPLACE FUNCTION prevent_sports_watch_football_completion_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'sports_watch_football_completion_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS sports_watch_football_completion_events_append_only
  ON sports_watch_football_completion_events;

CREATE TRIGGER sports_watch_football_completion_events_append_only
BEFORE UPDATE OR DELETE ON sports_watch_football_completion_events
FOR EACH ROW
EXECUTE FUNCTION prevent_sports_watch_football_completion_event_mutation();

ALTER TABLE sports_watch_candidate_events
  DROP CONSTRAINT IF EXISTS sports_watch_candidate_events_transition_check;

ALTER TABLE sports_watch_candidate_events
  ADD CONSTRAINT sports_watch_candidate_events_transition_check CHECK (
    (
      action = 'dismissed'
      AND from_status = 'validated'
      AND to_status = 'dismissed'
    )
    OR (
      action = 'restored'
      AND from_status = 'dismissed'
      AND to_status = 'validated'
    )
    OR (
      action = 'manual_created'
      AND from_status = to_status
      AND to_status IN ('pending', 'validated')
    )
    OR (
      action IN ('participation_unverifiable', 'not_exploitable')
      AND from_status = 'pending'
      AND to_status = 'dismissed'
    )
    OR (
      action = 'incorrect'
      AND from_status = 'pending'
      AND to_status = 'rejected'
    )
  );

COMMIT;
