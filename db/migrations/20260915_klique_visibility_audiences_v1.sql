-- Qualification de l origine et de l editeur d une publication suivie.
ALTER TABLE klique_visibility_publications
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'legacy_unclassified',
  ADD COLUMN IF NOT EXISTS publisher_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS external_post_id TEXT NULL;

ALTER TABLE klique_visibility_publications
  DROP CONSTRAINT IF EXISTS klique_visibility_publications_origin_check;

ALTER TABLE klique_visibility_publications
  ADD CONSTRAINT klique_visibility_publications_origin_check CHECK (
    origin IN ('legacy_unclassified', 'klique_owned', 'klique_distributed', 'external_coverage')
  );

ALTER TABLE klique_visibility_publications
  DROP CONSTRAINT IF EXISTS klique_visibility_publications_publisher_name_check;

ALTER TABLE klique_visibility_publications
  ADD CONSTRAINT klique_visibility_publications_publisher_name_check CHECK (
    publisher_name IS NULL OR btrim(publisher_name) <> ''
  );

ALTER TABLE klique_visibility_publications
  DROP CONSTRAINT IF EXISTS klique_visibility_publications_external_post_id_check;

ALTER TABLE klique_visibility_publications
  ADD CONSTRAINT klique_visibility_publications_external_post_id_check CHECK (
    external_post_id IS NULL OR btrim(external_post_id) <> ''
  );

-- Cette unicite permet aux tables filles de garantir publication et workspace dans une seule FK.
CREATE UNIQUE INDEX IF NOT EXISTS klique_visibility_publications_workspace_id_id_idx
  ON klique_visibility_publications (workspace_id, id);

-- Releves cumulatifs observes pour une publication: plusieurs points dans le temps, jamais un ecrasement.
CREATE TABLE IF NOT EXISTS klique_visibility_metric_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  views BIGINT NOT NULL CHECK (views >= 0),
  reach BIGINT NULL CHECK (reach >= 0),
  impressions BIGINT NULL CHECK (impressions >= 0),
  source TEXT NOT NULL CHECK (source IN ('manual', 'import', 'api')),
  created_by_clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT klique_visibility_metric_snapshots_workspace_publication_observed_unique
    UNIQUE (workspace_id, publication_id, observed_at),
  CONSTRAINT klique_visibility_metric_snapshots_publication_workspace_fk
    FOREIGN KEY (workspace_id, publication_id)
    REFERENCES klique_visibility_publications (workspace_id, id)
    ON DELETE CASCADE,
  CHECK (btrim(workspace_id) <> ''),
  CHECK (btrim(created_by_clerk_user_id) <> '')
);

CREATE INDEX IF NOT EXISTS klique_visibility_metric_snapshots_workspace_observed_idx
  ON klique_visibility_metric_snapshots (workspace_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS klique_visibility_metric_snapshots_workspace_publication_observed_idx
  ON klique_visibility_metric_snapshots (workspace_id, publication_id, observed_at DESC);

COMMENT ON COLUMN klique_visibility_publications.origin IS
  'Origine editoriale: contenu KLIQUE publie par KLIQUE, contenu KLIQUE distribue par un tiers, couverture externe ou publication historique non qualifiee.';

COMMENT ON TABLE klique_visibility_metric_snapshots IS
  'Releves cumulatifs de vues, portee et impressions par publication KLIQUE Visibility. Chaque releve appartient strictement au meme workspace que sa publication.';