CREATE TABLE IF NOT EXISTS media_days (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  day_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  location TEXT NULL,
  capacity INTEGER NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'completed', 'cancelled')),
  created_by_clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT media_days_title_not_blank CHECK (NULLIF(btrim(title), '') IS NOT NULL),
  CONSTRAINT media_days_description_not_blank CHECK (NULLIF(btrim(description), '') IS NOT NULL),
  CONSTRAINT media_days_location_not_blank CHECK (
    location IS NULL OR NULLIF(btrim(location), '') IS NOT NULL
  ),
  CONSTRAINT media_days_capacity_check CHECK (capacity IS NULL OR capacity > 0),
  CONSTRAINT media_days_hours_check CHECK (
    start_time IS NULL OR end_time IS NULL OR end_time > start_time
  )
);

CREATE INDEX IF NOT EXISTS media_days_workspace_status_idx
  ON media_days (workspace_id, status, day_date DESC);

CREATE INDEX IF NOT EXISTS media_days_workspace_date_idx
  ON media_days (workspace_id, day_date DESC, id DESC);

-- Association N-N : une journee media reunit plusieurs athletes, chacun avec son creneau et sa reponse.
CREATE TABLE IF NOT EXISTS media_day_athletes (
  media_day_id TEXT NOT NULL REFERENCES media_days (id) ON DELETE CASCADE,
  athlete_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (
    status IN ('invited', 'confirmed', 'declined', 'completed')
  ),
  slot_start TIME NULL,
  slot_end TIME NULL,
  responded_at TIMESTAMPTZ NULL,
  admin_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (media_day_id, athlete_id),
  CONSTRAINT media_day_athletes_athlete_not_blank CHECK (NULLIF(btrim(athlete_id), '') IS NOT NULL),
  CONSTRAINT media_day_athletes_slot_check CHECK (
    slot_start IS NULL OR slot_end IS NULL OR slot_end > slot_start
  ),
  CONSTRAINT media_day_athletes_responded_at_check CHECK (
    (status = 'invited') = (responded_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS media_day_athletes_workspace_athlete_idx
  ON media_day_athletes (workspace_id, athlete_id, status);

CREATE INDEX IF NOT EXISTS media_day_athletes_workspace_day_idx
  ON media_day_athletes (workspace_id, media_day_id, status);

COMMENT ON TABLE media_days IS
  'Journees media organisees par KLIQUE. Ecriture reservee a l Admin, isolation stricte par workspace.';

COMMENT ON COLUMN media_days.capacity IS
  'Nombre maximum d athletes attendus. NULL si non plafonne.';

COMMENT ON COLUMN media_days.status IS
  'Cycle de vie de la journee : draft, open, completed, cancelled.';

COMMENT ON TABLE media_day_athletes IS
  'Athletes invites a une journee media, avec leur creneau, leur reponse et la note interne Admin.';

COMMENT ON COLUMN media_day_athletes.admin_note IS
  'Note interne Admin sur la participation. Jamais alimentee par l athlete.';
