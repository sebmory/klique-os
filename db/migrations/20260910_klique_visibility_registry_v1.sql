-- btree_gist permet une contrainte d'exclusion combinant egalite (categorie) et chevauchement de plage (periode).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Date de debut du suivi detaille par workspace: separe l'historique manuel des publications detaillees.
CREATE TABLE IF NOT EXISTS klique_visibility_tracking_settings (
  workspace_id TEXT PRIMARY KEY,
  tracking_start_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (btrim(workspace_id) <> '')
);

COMMENT ON TABLE klique_visibility_tracking_settings IS
  'Date de debut du suivi detaille par workspace: la reprise historique reste strictement avant cette date, les publications detaillees commencent a partir de cette date incluse.';

CREATE TABLE IF NOT EXISTS klique_visibility_publications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN (
    'photo', 'video', 'carousel', 'story', 'reel', 'article', 'live', 'other'
  )),
  network TEXT NOT NULL CHECK (network IN (
    'instagram', 'tiktok', 'facebook', 'youtube', 'linkedin', 'website', 'other'
  )),
  published_at DATE NOT NULL,
  link TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (btrim(workspace_id) <> ''),
  CHECK (link IS NULL OR btrim(link) <> '')
);

CREATE INDEX IF NOT EXISTS klique_visibility_publications_workspace_published_idx
  ON klique_visibility_publications (workspace_id, published_at DESC);

-- Une publication detaillee doit etre datee a partir du debut du suivi du workspace (borne inferieure incluse).
CREATE OR REPLACE FUNCTION klique_visibility_enforce_publication_tracking_start()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  tracking_start DATE;
BEGIN
  SELECT tracking_start_date INTO tracking_start
  FROM klique_visibility_tracking_settings
  WHERE workspace_id = NEW.workspace_id;

  IF tracking_start IS NULL THEN
    RAISE EXCEPTION 'Aucune date de debut de suivi configuree pour ce workspace';
  END IF;

  IF NEW.published_at < tracking_start THEN
    RAISE EXCEPTION 'Une publication detaillee doit etre datee a partir du debut du suivi (%)', tracking_start;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS klique_visibility_publications_tracking_start_check ON klique_visibility_publications;
CREATE TRIGGER klique_visibility_publications_tracking_start_check
  BEFORE INSERT OR UPDATE ON klique_visibility_publications
  FOR EACH ROW EXECUTE FUNCTION klique_visibility_enforce_publication_tracking_start();

-- Une publication reelle porte un ou plusieurs athletes; un carrousel reste une seule publication.
CREATE TABLE IF NOT EXISTS klique_visibility_publication_athletes (
  publication_id TEXT NOT NULL REFERENCES klique_visibility_publications (id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  athlete_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (publication_id, athlete_id),
  CHECK (btrim(athlete_id) <> '')
);

CREATE INDEX IF NOT EXISTS klique_visibility_publication_athletes_workspace_athlete_idx
  ON klique_visibility_publication_athletes (workspace_id, athlete_id);

-- Reprise historique saisie manuellement: quantite agregee par periode/format/reseau, jamais des publications individuelles.
CREATE TABLE IF NOT EXISTS klique_visibility_history_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'athlete')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  format TEXT NOT NULL CHECK (format IN (
    'photo', 'video', 'carousel', 'story', 'reel', 'article', 'live', 'other'
  )),
  network TEXT NOT NULL CHECK (network IN (
    'instagram', 'tiktok', 'facebook', 'youtube', 'linkedin', 'website', 'other'
  )),
  athlete_id TEXT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (btrim(workspace_id) <> ''),
  CHECK (period_start <= period_end),
  CHECK (
    (scope = 'global' AND athlete_id IS NULL)
    OR (scope = 'athlete' AND athlete_id IS NOT NULL AND btrim(athlete_id) <> '')
  )
);

-- Un seul total global par periode/format/reseau: jamais deductible en sommant les lignes par athlete.
ALTER TABLE klique_visibility_history_entries
  ADD COLUMN IF NOT EXISTS period daterange
  GENERATED ALWAYS AS (daterange(period_start, period_end, '[]')) STORED;

-- Bloque toute periode historique chevauchante pour une meme categorie (scope, athlete, format, reseau),
-- y compris sous insertions concurrentes: la contrainte est verifiee par l'index, pas par le code applicatif.
ALTER TABLE klique_visibility_history_entries
  DROP CONSTRAINT IF EXISTS klique_visibility_history_entries_no_overlap_excl;

ALTER TABLE klique_visibility_history_entries
  ADD CONSTRAINT klique_visibility_history_entries_no_overlap_excl
  EXCLUDE USING gist (
    workspace_id WITH =,
    scope WITH =,
    format WITH =,
    network WITH =,
    COALESCE(athlete_id, '') WITH =,
    period WITH &&
  );

CREATE INDEX IF NOT EXISTS klique_visibility_history_entries_workspace_scope_idx
  ON klique_visibility_history_entries (workspace_id, scope, period_start DESC);

-- Une reprise historique doit se terminer avant le debut du suivi detaille du workspace.
CREATE OR REPLACE FUNCTION klique_visibility_enforce_history_before_tracking_start()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  tracking_start DATE;
BEGIN
  SELECT tracking_start_date INTO tracking_start
  FROM klique_visibility_tracking_settings
  WHERE workspace_id = NEW.workspace_id;

  IF tracking_start IS NULL THEN
    RAISE EXCEPTION 'Aucune date de debut de suivi configuree pour ce workspace';
  END IF;

  IF NEW.period_end >= tracking_start THEN
    RAISE EXCEPTION 'Une reprise historique doit se terminer avant le debut du suivi (%)', tracking_start;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS klique_visibility_history_entries_tracking_start_check ON klique_visibility_history_entries;
CREATE TRIGGER klique_visibility_history_entries_tracking_start_check
  BEFORE INSERT OR UPDATE ON klique_visibility_history_entries
  FOR EACH ROW EXECUTE FUNCTION klique_visibility_enforce_history_before_tracking_start();

COMMENT ON TABLE klique_visibility_publications IS
  'Registre de visibilite KLIQUE: publications reelles (format, reseau, date, lien facultatif). Aucun lien avec les credits ou les demandes de services.';

COMMENT ON TABLE klique_visibility_publication_athletes IS
  'Association publication/athlete: une publication multi-athletes compte une fois au total et une fois pour chaque athlete associe.';

COMMENT ON TABLE klique_visibility_history_entries IS
  'Reprise historique saisie manuellement (periode, format, reseau, quantite), sans publications individuelles inventees, toujours terminee avant klique_visibility_tracking_settings.tracking_start_date. Le total global (scope=global) est saisi et contraint independamment des lignes par athlete (scope=athlete): il ne doit jamais etre deduit en sommant ces dernieres, pour eviter tout double compte avec les publications detaillees. Les periodes chevauchantes pour une meme categorie (scope, athlete, format, reseau) sont bloquees par une contrainte d''exclusion, y compris lors d''insertions concurrentes.';
