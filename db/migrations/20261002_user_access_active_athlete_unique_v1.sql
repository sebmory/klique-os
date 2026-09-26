BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM user_access
    WHERE role = 'athlete'
      AND status = 'active'
      AND athlete_id IS NOT NULL
      AND btrim(athlete_id) <> ''
    GROUP BY workspace_id, btrim(athlete_id)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Impossible de créer l index unique des accès Athlete actifs : doublon détecté pour (workspace_id, btrim(athlete_id)).';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS user_access_active_athlete_unique_idx
  ON user_access (workspace_id, athlete_id)
  WHERE role = 'athlete'
    AND status = 'active'
    AND athlete_id IS NOT NULL;

COMMIT;